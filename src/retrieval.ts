import type { Note } from "./notes.js";

const STOP = new Set(
  "a an the and or of to in on for with is are was were be been what why how when who which do does did this that these those it its as at by from about can i my me we our you your not tell explain".split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export interface Selection {
  notes: Note[];
  mode: "all" | "ranked";
  totalNotes: number;
}

/** Roughly 200k chars ≈ 50k tokens: comfortably inside Claude's context window. */
export const DEFAULT_BUDGET_CHARS = 200_000;

export function scoreNote(note: Note, terms: string[], today = new Date()): number {
  const title = note.title.toLowerCase();
  const body = note.body.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += 3;
    const hits = body.split(t).length - 1;
    score += Math.min(hits, 5);
  }
  // recency: up to +2 for today, decaying with a ~30 day half-life
  const days = (today.getTime() - new Date(note.date).getTime()) / 86_400_000;
  if (Number.isFinite(days) && days >= 0) score += 2 * Math.pow(0.5, days / 30);
  return score;
}

export function selectNotes(
  notes: Note[],
  question: string,
  budget = DEFAULT_BUDGET_CHARS,
  today = new Date(),
): Selection {
  const total = notes.reduce((n, x) => n + x.body.length, 0);
  if (total <= budget) return { notes, mode: "all", totalNotes: notes.length };

  const terms = tokenize(question);
  const ranked = [...notes]
    .map((n) => ({ n, s: scoreNote(n, terms, today) }))
    .sort((a, b) => b.s - a.s);
  const picked: Note[] = [];
  let used = 0;
  for (const { n } of ranked) {
    if (used + n.body.length > budget) continue;
    picked.push(n);
    used += n.body.length;
  }
  return { notes: picked, mode: "ranked", totalNotes: notes.length };
}
