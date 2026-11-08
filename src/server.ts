import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LOGIN_FIX, checkAuth, checkClaude, friendlyError, runClaude, type Runner } from "./claude.js";
import { DEFAULT_COURSES, PALETTE, PROFILES, activeIdsOf, idsOf } from "./courses.js";
import { NOTES_DIR, SAMPLE_DIR, listCourses, loadNotes, readNote, citationLabel, resolveNotesDir } from "./notes.js";
import { PROFILE_INFO } from "./profiles.js";
import { RegistryError, addCourse, loadRegistry, updateCourse } from "./registry.js";
import { type ChatTurn } from "./prompt.js";
import { answerQuestion } from "./answer.js";
import { appendMessage, clearChat, loadChats, studyStreak, type ChatMessage } from "./chats.js";
import { loadSettings, saveSettings } from "./settings.js";
import { runDoctor } from "./doctor.js";
import { DATA_DIR } from "./paths.js";
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

  /** Demo mode pins the seed courses; otherwise the user's own registry applies. */
  const current = () => {
    const { demo } = loadSettings(deps.dataDir);
    const courses = demo ? DEFAULT_COURSES : loadRegistry(deps.dataDir);
    return { demo, courses, ...resolveNotesDir(deps.notesDir, deps.sampleDir, demo, idsOf(courses)) };
  };
  const validCourse = (c: unknown): c is string => typeof c === "string" && (c === "all" || idsOf(current().courses).includes(c));
  // Sample-note chats are kept apart from real-note chats so a demo never mixes with real history.
  const chatKey = (course: string) => (current().source === "samples" ? `sample:${course}` : course);

  app.get("/api/state", (_req, res) => {
    const { demo, dir, source, courses } = current();
    res.json({
      demo, source, editable: !demo, ...listCourses(dir, courses), streak: studyStreak(loadChats(deps.dataDir)),
      profiles: PROFILES.map((id) => ({ id, label: PROFILE_INFO[id].label })), palette: PALETTE,
    });
  });

  const registryRoute = (fn: () => unknown, res: express.Response) => {
    if (current().demo) return res.status(409).json({ error: "Demo mode uses a fixed set of sample courses. Turn it off to manage your own." });
    try {
      res.json(fn());
    } catch (e) {
      if (e instanceof RegistryError) return res.status(400).json({ error: e.message });
      throw e;
    }
  };
  app.post("/api/courses", (req, res) => registryRoute(() => addCourse(deps.dataDir, req.body ?? {}), res));
  app.patch("/api/courses/:id", (req, res) => registryRoute(() => updateCourse(deps.dataDir, req.params.id, req.body ?? {}), res));

  app.post("/api/settings", (req, res) => {
    saveSettings(deps.dataDir, { demo: !!req.body?.demo });
    res.json({ ok: true });
  });

  app.get("/api/notes/:course/:file", (req, res) => {
    const c = current();
    const note = readNote(req.params.course, req.params.file, c.dir, idsOf(c.courses));
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
    const cur = current();

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const history: ChatTurn[] = (loadChats(deps.dataDir)[key] ?? [])
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));

    appendMessage(deps.dataDir, key, { id: randomUUID(), role: "user", text: q, createdAt: new Date().toISOString(), useGeneral: general });

    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const notes = loadNotes(course, cur.dir, activeIdsOf(cur.courses));
      const r = await answerQuestion({
        runner: deps.runner, notes, courses: cur.courses, question: q, general, history,
        onMeta: (meta) => send("meta", meta),
        onText: (chunk) => send("delta", chunk),
        signal: abort.signal,
      });
      const msg: ChatMessage = {
        id: randomUUID(), role: "assistant", text: r.text, createdAt: new Date().toISOString(),
        citations: r.citations, notesUsed: r.notesUsed, mode: r.mode, useGeneral: general,
      };
      appendMessage(deps.dataDir, key, msg);
      send("done", { text: r.text, citations: r.citations });
    } catch (e) {
      const message = friendlyError(e);
      if (!abort.signal.aborted) {
        appendMessage(deps.dataDir, key, { id: randomUUID(), role: "assistant", text: message, createdAt: new Date().toISOString(), error: true });
        send("error", { message });
      }
    }
    res.end();
  });

  app.get("/api/doctor", async (req, res) => {
    res.json(await runDoctor({ dataDir: deps.dataDir, notesDir: deps.notesDir, courses: loadRegistry(deps.dataDir), runner: deps.runner }, { deep: req.query.deep === "1" }));
  });

  app.post("/api/sync", async (_req, res) => {
    try {
      res.json(await runSync({ runner: deps.runner, notesDir: deps.notesDir, courses: loadRegistry(deps.dataDir) }));
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
  const app = createApp({ runner: runClaude, notesDir: NOTES_DIR, sampleDir: SAMPLE_DIR, dataDir: DATA_DIR });
  app.listen(port, "127.0.0.1", () => {
    console.log(`StudyDeck running at http://localhost:${port}  (${c.version})`);
    if (!checkAuth().loggedIn) console.warn(`\n⚠ Claude Code isn't logged in, so questions will fail until you sign in. ${LOGIN_FIX}\n`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
