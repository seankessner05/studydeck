import type { Citation } from "../citations.js";

export interface EvalCase {
  id: string;
  /** A course id or "all". */
  course: string;
  question: string;
  general?: boolean;
  expect: {
    /** The notes do not cover this: the answer must say "Not in your notes". */
    notInNotes?: boolean;
    /** Each substring must appear in the id of some verified citation. */
    sources?: string[];
    /** Each entry must appear in the answer; an array entry means "any of these". */
    contains?: (string | string[])[];
  };
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface CaseResult {
  id: string;
  pass: boolean;
  checks: CheckResult[];
  text: string;
  ms: number;
  costUsd?: number;
  error?: string;
}

/** Lowercase, drop thousands separators, unify minus signs and spacing, so "$1,800" matches "1800". */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const NOT_IN_NOTES = "not in your notes";

export function scoreCase(c: EvalCase, answer: { text: string; citations: Citation[] }): CheckResult[] {
  const text = normalizeText(answer.text);
  const good = answer.citations.filter((x) => x.status === "ok");
  const checks: CheckResult[] = [];

  checks.push({
    name: "citations verified",
    pass: answer.citations.every((x) => x.status === "ok"),
    detail: answer.citations.filter((x) => x.status !== "ok").map((x) => `${x.status}: ${x.raw}`).join("; ") || undefined,
  });

  if (c.expect.notInNotes) {
    checks.push({ name: "says Not in your notes", pass: text.includes(NOT_IN_NOTES) });
  } else {
    checks.push({ name: "no false refusal", pass: !text.slice(0, 60).includes(NOT_IN_NOTES), detail: "answer opens with a refusal" });
    checks.push({ name: "cites a source", pass: good.length > 0 });
  }

  for (const s of c.expect.sources ?? []) {
    checks.push({ name: `cites ${s}`, pass: good.some((x) => x.noteId?.includes(s)) });
  }
  for (const want of c.expect.contains ?? []) {
    const options = (Array.isArray(want) ? want : [want]).map(normalizeText);
    checks.push({
      name: `mentions ${options.length > 1 ? options.map((o) => `"${o}"`).join(" / ") : `"${options[0]}"`}`,
      pass: options.some((o) => text.includes(o)),
    });
  }
  return checks;
}

export interface Report {
  at: string;
  total: number;
  passed: number;
  cases: { id: string; pass: boolean; failed: string[] }[];
}

export function summarize(results: CaseResult[], at = new Date()): Report {
  return {
    at: at.toISOString(),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    cases: results.map((r) => ({ id: r.id, pass: r.pass, failed: r.checks.filter((c) => !c.pass).map((c) => c.name) })),
  };
}

/** Cases that passed before and fail now (regressions), and the reverse (fixes). */
export function compareReports(prev: Report | undefined, now: Report) {
  if (!prev) return { regressions: [] as string[], fixes: [] as string[] };
  const before = new Map(prev.cases.map((c) => [c.id, c.pass]));
  return {
    regressions: now.cases.filter((c) => !c.pass && before.get(c.id) === true).map((c) => c.id),
    fixes: now.cases.filter((c) => c.pass && before.get(c.id) === false).map((c) => c.id),
  };
}
