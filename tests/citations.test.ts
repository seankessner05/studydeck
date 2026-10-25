import { describe, it, expect } from "vitest";
import { extractCitations } from "../src/citations";
import type { Note } from "../src/notes";

const note: Note = {
  id: "ECON300/2026-10-14_a.md", course: "ECON300", file: "2026-10-14_a.md", date: "2026-10-14",
  title: "Fiscal Multipliers", sample: true,
  body: "| Simple multiplier formula | With MPC = 0.8 the multiplier is 1 / (1 − 0.8) = 5. |",
};

describe("citations", () => {
  it("validates a citation with a verbatim quote", () => {
    const [c] = extractCitations('It is 5 [ECON300 2026-10-14: Fiscal Multipliers | "the multiplier is 1 / (1 − 0.8) = 5"].', [note]);
    expect(c).toMatchObject({ status: "ok", noteId: note.id, course: "ECON300" });
  });

  it("flags a made-up quote", () => {
    const [c] = extractCitations('x [ECON300 2026-10-14: Fiscal Multipliers | "the multiplier is always ten"]', [note]);
    expect(c.status).toBe("quote_not_found");
  });

  it("flags notes that were not provided", () => {
    const [c] = extractCitations("x [ECON301 2026-10-14: Elasticity]", [note]);
    expect(c.status).toBe("unknown_note");
  });

  it("accepts a citation without a quote and dedupes repeats", () => {
    const cs = extractCitations("a [ECON300 2026-10-14: Fiscal Multipliers] b [ECON300 2026-10-14: Fiscal Multipliers]", [note]);
    expect(cs).toHaveLength(1);
    expect(cs[0].status).toBe("ok");
  });

  it("ignores ordinary brackets", () => {
    expect(extractCitations("see [1] and [note]", [note])).toEqual([]);
  });
});
