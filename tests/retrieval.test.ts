import { describe, it, expect } from "vitest";
import { selectNotes, tokenize, scoreNote } from "../src/retrieval";
import type { Note } from "../src/notes";

const mk = (title: string, date: string, body: string): Note => ({
  id: `X/${date}_${title}.md`, course: "X", file: `${date}_${title}.md`, date, title, sample: false, body,
});

describe("retrieval", () => {
  it("sends everything when notes fit the budget", () => {
    const notes = [mk("a", "2026-01-01", "x"), mk("b", "2026-01-02", "y")];
    const sel = selectNotes(notes, "anything", 1000);
    expect(sel.mode).toBe("all");
    expect(sel.notes).toHaveLength(2);
  });

  it("ranks by keywords when over budget", () => {
    const today = new Date("2026-10-25");
    const notes = [
      mk("Pizza", "2026-10-20", "cheese ".repeat(50)),
      mk("Fiscal Multipliers", "2026-10-01", "the multiplier is 1/(1-MPC) " + "x".repeat(60)),
      mk("Other", "2026-10-02", "y".repeat(60)),
    ];
    const sel = selectNotes(notes, "What is the fiscal multiplier?", 150, today);
    expect(sel.mode).toBe("ranked");
    expect(sel.notes[0].title).toBe("Fiscal Multipliers");
    expect(sel.notes.reduce((n, x) => n + x.body.length, 0)).toBeLessThanOrEqual(150);
  });

  it("recency breaks ties", () => {
    const today = new Date("2026-10-25");
    const newer = mk("Same", "2026-10-24", "word");
    const older = mk("Same", "2026-01-01", "word");
    expect(scoreNote(newer, ["word"], today)).toBeGreaterThan(scoreNote(older, ["word"], today));
  });

  it("drops stopwords", () => {
    expect(tokenize("What is the multiplier?")).toEqual(["multiplier"]);
  });
});
