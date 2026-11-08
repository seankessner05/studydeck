import { describe, it, expect } from "vitest";
import path from "node:path";
import { answerQuestion } from "../src/answer";
import { loadNotes } from "../src/notes";
import { DEFAULT_COURSES } from "../src/courses";
import type { Runner } from "../src/claude";

const notes = loadNotes("all", path.resolve("sample-notes"));

describe("answerQuestion", () => {
  it("builds a profile-aware prompt, reports meta, and validates citations", async () => {
    let seen: { system?: string; prompt: string } = { prompt: "" };
    const runner: Runner = async (o) => {
      seen = o;
      return { text: 'Taxes shrink it [ECON300 2026-10-14: Fiscal Multipliers | "falls to 2.5"].', costUsd: 0.01 };
    };
    const metas: unknown[] = [];
    const r = await answerQuestion({
      runner, notes: notes.filter((n) => n.course === "ECON300"), courses: DEFAULT_COURSES,
      question: "How do taxes change the multiplier?", onMeta: (m) => metas.push(m),
    });
    expect(metas).toHaveLength(1);
    expect(r.notesUsed).toHaveLength(3);
    expect(r.citations.map((c) => c.status)).toEqual(["ok"]);
    expect(seen.system).toContain("For notes from ECON300 (Quantitative economics)");
    expect(seen.system).not.toContain("Accounting");
    expect(r.costUsd).toBe(0.01);
  });
});
