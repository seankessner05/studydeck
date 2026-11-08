import type { Runner } from "./claude.js";
import type { Course } from "./courses.js";
import { extractCitations, type Citation } from "./citations.js";
import { citationLabel, type Note } from "./notes.js";
import { profileGuidance } from "./profiles.js";
import { buildSystemPrompt, buildUserPrompt, type ChatTurn } from "./prompt.js";
import { selectNotes } from "./retrieval.js";

export interface AnswerMeta {
  notesUsed: { id: string; label: string }[];
  mode: "all" | "ranked";
  totalNotes: number;
}

export interface AnswerInput {
  runner: Runner;
  /** Every note in scope; retrieval picks what to send. */
  notes: Note[];
  courses: Course[];
  question: string;
  general?: boolean;
  history?: ChatTurn[];
  today?: Date;
  onMeta?: (meta: AnswerMeta) => void;
  onText?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface AnswerResult extends AnswerMeta {
  text: string;
  citations: Citation[];
  costUsd?: number;
}

/** The one place a question becomes a cited answer. The server and the regression runner both call this. */
export async function answerQuestion(i: AnswerInput): Promise<AnswerResult> {
  const sel = selectNotes(i.notes, i.question);
  const meta: AnswerMeta = {
    notesUsed: sel.notes.map((n) => ({ id: n.id, label: citationLabel(n) })),
    mode: sel.mode,
    totalNotes: sel.totalNotes,
  };
  i.onMeta?.(meta);
  const guidance = profileGuidance(i.courses, [...new Set(sel.notes.map((n) => n.course))]);
  const result = await i.runner({
    system: buildSystemPrompt(!!i.general, guidance),
    prompt: buildUserPrompt(i.question, sel.notes, i.history ?? [], i.today),
    onText: i.onText,
    signal: i.signal,
  });
  return { ...meta, text: result.text, citations: extractCitations(result.text, sel.notes), costUsd: result.costUsd };
}
