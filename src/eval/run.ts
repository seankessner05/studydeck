import fs from "node:fs";
import path from "node:path";
import { answerQuestion } from "../answer.js";
import { LOGIN_FIX, checkAuth, checkClaude, friendlyError, runClaude, type Runner } from "../claude.js";
import { DEFAULT_COURSES } from "../courses.js";
import { SAMPLE_DIR, loadNotes } from "../notes.js";
import { DATA_DIR } from "../paths.js";
import { compareReports, scoreCase, summarize, type CaseResult, type EvalCase, type Report } from "./score.js";

const CASES_FILE = path.resolve("evals/cases.json");
const REPORT_FILE = path.join(DATA_DIR, "eval-report.json");

export async function runCase(c: EvalCase, runner: Runner, notesDir = SAMPLE_DIR): Promise<CaseResult> {
  const started = Date.now();
  try {
    const notes = loadNotes(c.course, notesDir);
    const a = await answerQuestion({ runner, notes, courses: DEFAULT_COURSES, question: c.question, general: c.general });
    const checks = scoreCase(c, a);
    return { id: c.id, pass: checks.every((k) => k.pass), checks, text: a.text, ms: Date.now() - started, costUsd: a.costUsd };
  } catch (e) {
    return { id: c.id, pass: false, checks: [{ name: "ran without error", pass: false, detail: friendlyError(e) }], text: "", ms: Date.now() - started, error: friendlyError(e) };
  }
}

export async function runAll(cases: EvalCase[], runner: Runner, concurrency = 3, onDone?: (r: CaseResult) => void): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(cases[i], runner);
      onDone?.(results[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  return results;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const c = checkClaude();
  if (!c.ok) {
    console.error(`\n✖ ${c.error}\n`);
    process.exit(1);
  }
  if (!checkAuth().loggedIn) {
    console.error(`\n✖ Claude Code isn't logged in, so no question can be answered. ${LOGIN_FIX}\n`);
    process.exit(2);
  }
  let cases: EvalCase[] = JSON.parse(fs.readFileSync(CASES_FILE, "utf8"));
  const only = arg("only")?.split(",");
  if (only) cases = cases.filter((x) => only.includes(x.id));
  const min = Number(arg("min") ?? 0.85);
  const concurrency = Number(arg("concurrency") ?? 3);
  console.log(`Running ${cases.length} regression questions against the sample notes (${concurrency} at a time)…\n`);

  const results = await runAll(cases, runClaude, concurrency, (r) => {
    console.log(`${r.pass ? "✓" : "✗"} ${r.id.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s`);
    for (const k of r.checks.filter((k) => !k.pass)) console.log(`    ✗ ${k.name}${k.detail ? ` (${k.detail})` : ""}`);
  });

  const report = summarize(results);
  const prev: Report | undefined = fs.existsSync(REPORT_FILE) && !only ? JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")) : undefined;
  const { regressions, fixes } = compareReports(prev, report);
  const cost = results.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  const avg = results.reduce((n, r) => n + r.ms, 0) / Math.max(1, results.length) / 1000;

  console.log(`\n${report.passed}/${report.total} passed (${Math.round((100 * report.passed) / report.total)}%) · avg ${avg.toFixed(1)}s per answer · ~$${cost.toFixed(2)}`);
  if (prev) console.log(`vs last run (${prev.at.slice(0, 16).replace("T", " ")}): ${prev.passed}/${prev.total}`);
  if (regressions.length) console.log(`⚠ REGRESSIONS: ${regressions.join(", ")}`);
  if (fixes.length) console.log(`✓ newly passing: ${fixes.join(", ")}`);

  const allErrored = results.length > 0 && results.every((r) => r.error);
  if (allErrored) console.log("\nEvery question errored, so this run was not saved as a baseline.");
  if (!only && !allErrored) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify({ ...report, results }, null, 2));
  }
  process.exit(report.passed / report.total >= min && !regressions.length ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
