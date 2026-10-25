import type { Note } from "./notes.js";

export interface Citation {
  raw: string;
  course: string;
  date: string;
  topic: string;
  quote?: string;
  /** Matching note id (course/file) when the citation points at a note that was sent. */
  noteId?: string;
  status: "ok" | "quote_not_found" | "unknown_note";
}

const CITATION_RE = /\[([A-Za-z0-9]+) (\d{4}-\d{2}-\d{2}): ([^\]|]+?)(?:\s*\|\s*["“]([^\]]*?)["”])?\s*\]/g;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*_`|>#]/g, " ")
    .replace(/[^\p{L}\p{N}.%/+−=-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCitations(text: string, notes: Note[]): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION_RE)) {
    const [raw, course, date, topicRaw, quote] = m;
    if (seen.has(raw)) continue;
    seen.add(raw);
    const topic = topicRaw.trim();
    const sameDay = notes.filter((n) => n.course === course && n.date === date);
    const note =
      sameDay.find((n) => normalize(n.title) === normalize(topic)) ??
      sameDay.find((n) => normalize(n.title).includes(normalize(topic)) || normalize(topic).includes(normalize(n.title))) ??
      (sameDay.length === 1 ? sameDay[0] : undefined);
    if (!note) {
      out.push({ raw, course, date, topic, quote, status: "unknown_note" });
      continue;
    }
    const quoteOk = !quote || normalize(note.body).includes(normalize(quote));
    out.push({ raw, course, date, topic, quote, noteId: note.id, status: quoteOk ? "ok" : "quote_not_found" });
  }
  return out;
}
