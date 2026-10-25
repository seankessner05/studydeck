import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkClaude, friendlyError, runClaude, type Runner } from "./claude.js";
import { COURSE_IDS } from "./courses.js";
import { NOTES_DIR, SAMPLE_DIR, listCourses, loadNotes, readNote, citationLabel, resolveNotesDir } from "./notes.js";
import { selectNotes } from "./retrieval.js";
import { buildSystemPrompt, buildUserPrompt, type ChatTurn } from "./prompt.js";
import { extractCitations } from "./citations.js";
import { appendMessage, clearChat, loadChats, studyStreak, type ChatMessage } from "./chats.js";
import { loadSettings, saveSettings } from "./settings.js";
import { runSync } from "./sync.js";

export interface AppDeps {
  runner: Runner;
  notesDir: string;
  sampleDir: string;
  dataDir: string;
}

const HISTORY_TURNS = 6;

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public")));

  const validCourse = (c: unknown): c is string => typeof c === "string" && (c === "all" || COURSE_IDS.includes(c));
  const current = () => {
    const { demo } = loadSettings(deps.dataDir);
    return { demo, ...resolveNotesDir(deps.notesDir, deps.sampleDir, demo) };
  };
  // Sample-note chats are kept apart from real-note chats so a demo never mixes with real history.
  const chatKey = (course: string) => (current().source === "samples" ? `sample:${course}` : course);

  app.get("/api/state", (_req, res) => {
    const { demo, dir, source } = current();
    res.json({ demo, source, ...listCourses(dir), streak: studyStreak(loadChats(deps.dataDir)) });
  });

  app.post("/api/settings", (req, res) => {
    saveSettings(deps.dataDir, { demo: !!req.body?.demo });
    res.json({ ok: true });
  });

  app.get("/api/notes/:course/:file", (req, res) => {
    const note = readNote(req.params.course, req.params.file, current().dir);
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ ...note, label: citationLabel(note) });
  });

  app.get("/api/chats/:course", (req, res) => {
    res.json(loadChats(deps.dataDir)[chatKey(req.params.course)] ?? []);
  });

  app.delete("/api/chats/:course", (req, res) => {
    clearChat(deps.dataDir, chatKey(req.params.course));
    res.json({ ok: true });
  });

  app.post("/api/chat", async (req, res) => {
    const { course, question, useGeneral } = req.body ?? {};
    if (!validCourse(course) || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "course and question are required" });
    }
    const q = question.trim();
    const general = !!useGeneral;
    const key = chatKey(course);

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const history: ChatTurn[] = (loadChats(deps.dataDir)[key] ?? [])
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));

    appendMessage(deps.dataDir, key, { id: randomUUID(), role: "user", text: q, createdAt: new Date().toISOString(), useGeneral: general });

    const sel = selectNotes(loadNotes(course, current().dir), q);
    const notesUsed = sel.notes.map((n) => ({ id: n.id, label: citationLabel(n) }));
    send("meta", { notesUsed, mode: sel.mode, totalNotes: sel.totalNotes });

    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const result = await deps.runner({
        system: buildSystemPrompt(general),
        prompt: buildUserPrompt(q, sel.notes, history),
        onText: (chunk) => send("delta", chunk),
        signal: abort.signal,
      });
      const citations = extractCitations(result.text, sel.notes);
      const msg: ChatMessage = {
        id: randomUUID(), role: "assistant", text: result.text, createdAt: new Date().toISOString(),
        citations, notesUsed, mode: sel.mode, useGeneral: general,
      };
      appendMessage(deps.dataDir, key, msg);
      send("done", { text: result.text, citations });
    } catch (e) {
      const message = friendlyError(e);
      if (!abort.signal.aborted) {
        appendMessage(deps.dataDir, key, { id: randomUUID(), role: "assistant", text: message, createdAt: new Date().toISOString(), error: true });
        send("error", { message });
      }
    }
    res.end();
  });

  app.post("/api/sync", async (_req, res) => {
    try {
      res.json(await runSync({ runner: deps.runner, notesDir: deps.notesDir }));
    } catch (e) {
      res.status(500).json({ error: friendlyError(e) });
    }
  });

  return app;
}

function main() {
  const c = checkClaude();
  if (!c.ok) {
    console.error(`\n✖ ${c.error}\n`);
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp({ runner: runClaude, notesDir: NOTES_DIR, sampleDir: SAMPLE_DIR, dataDir: path.resolve("data") });
  app.listen(port, "127.0.0.1", () => {
    console.log(`StudyDeck running at http://localhost:${port}  (${c.version})`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
