import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compareReports, normalizeText, scoreCase, summarize, type EvalCase } from "../src/eval/score";
import { runAll, runCase } from "../src/eval/run";
import { SAMPLE_DIR, loadNotes } from "../src/notes";
import { DEFAULT_COURSES } from "../src/courses";
import type { Citation } from "../src/citations";
import type { Runner } from "../src/claude";

const cases: EvalCase[] = JSON.parse(fs.readFileSync(path.resolve("evals/cases.json"), "utf8"));
const ok = (noteId: string): Citation => ({ raw: "[x]", course: "C", date: "2026-01-01", topic: "t", noteId, status: "ok" });

describe("regression question set", () => {
  it("is well formed: unique ids, real courses, sources that exist in the sample notes", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const all = loadNotes("all", SAMPLE_DIR);
    for (const c of cases) {
      expect(c.course === "all" || DEFAULT_COURSES.some((x) => x.id === c.course), c.id).toBe(true);
      const pool = c.course === "all" ? all : all.filter((n) => n.course === c.course);
      for (const s of c.expect.sources ?? []) expect(pool.some((n) => n.id.includes(s)), `${c.id} -> ${s}`).toBe(true);
      expect(c.expect.notInNotes && c.expect.sources?.length, c.id).toBeFalsy();
    }
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });
});

describe("scoring", () => {
  const base: EvalCase = { id: "t", course: "ECON196", question: "q", expect: { sources: ["depreciation"], contains: ["1800", ["a", "b"]] } };

  it("normalizes numbers and dashes", () => {
    expect(normalizeText("$1,800 − 5")).toBe("$1800 - 5");
  });

  it("passes a good answer", () => {
    const checks = scoreCase(base, { text: "It is $1,800 per year, a.", citations: [ok("ECON196/2026-10-13_sample-depreciation-methods.md")] });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails on a missing fact, a missing source, an invalid citation, or no citation", () => {
    const wrong = scoreCase(base, { text: "It is $900.", citations: [] });
    expect(wrong.filter((c) => !c.pass).map((c) => c.name)).toEqual(expect.arrayContaining(['mentions "1800"', "cites depreciation", "cites a source"]));
    const bad = scoreCase(base, { text: "$1800 a", citations: [{ ...ok("x"), status: "quote_not_found" }] });
    expect(bad.find((c) => c.name === "citations verified")?.pass).toBe(false);
  });

  it("flags a false refusal on an answerable question", () => {
    const checks = scoreCase(base, { text: "Not in your notes. Sorry.", citations: [] });
    expect(checks.find((c) => c.name === "no false refusal")?.pass).toBe(false);
  });

  it("requires the honest refusal on not-covered questions", () => {
    const c: EvalCase = { id: "n", course: "all", question: "q", expect: { notInNotes: true } };
    expect(scoreCase(c, { text: "Not in your notes.", citations: [] }).every((k) => k.pass)).toBe(true);
    expect(scoreCase(c, { text: "Paris.", citations: [] }).find((k) => k.name === "says Not in your notes")?.pass).toBe(false);
  });

  it("compares reports for regressions and fixes", () => {
    const a = summarize([{ id: "x", pass: true, checks: [], text: "", ms: 1 }, { id: "y", pass: false, checks: [{ name: "n", pass: false }], text: "", ms: 1 }]);
    const b = summarize([{ id: "x", pass: false, checks: [{ name: "n", pass: false }], text: "", ms: 1 }, { id: "y", pass: true, checks: [], text: "", ms: 1 }]);
    expect(compareReports(a, b)).toEqual({ regressions: ["x"], fixes: ["y"] });
    expect(compareReports(undefined, b)).toEqual({ regressions: [], fixes: [] });
  });
});

describe("runner", () => {
  const fake: Runner = async (o) =>
    o.prompt.includes("Solow") ? { text: "Not in your notes." } : { text: 'It is 5 [ECON300 2026-10-14: Fiscal Multipliers | "the multiplier is 1 / (1 − 0.8) = 5"].' };

  it("scores answers produced through the real prompt pipeline", async () => {
    const good = await runCase(cases.find((c) => c.id === "macro-multiplier-basic")!, fake);
    expect(good.pass, JSON.stringify(good.checks)).toBe(true);
    const refusal = await runCase(cases.find((c) => c.id === "macro-not-covered")!, fake);
    expect(refusal.pass).toBe(true);
  });

  it("turns a runner crash into a failed case instead of crashing the run", async () => {
    const boom: Runner = async () => {
      throw new Error("rate_limit_error");
    };
    const results = await runAll(cases.slice(0, 4), boom, 2);
    expect(results.every((r) => !r.pass && r.error)).toBe(true);
    expect(results).toHaveLength(4);
  });
});
