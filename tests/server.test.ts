import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createApp } from "../src/server";
import type { Runner } from "../src/claude";

let server: Server, base: string, dataDir: string, notesDir: string;
let lastPrompt = "";
let fail = false;
const runner: Runner = async (o) => {
  lastPrompt = o.prompt;
  if (fail) throw new Error("Not logged in · Please run /login");
  const text = 'It is 5 [ECON300 2026-10-14: Fiscal Multipliers | "1 / (1 − 0.8) = 5"] and a fake [ECON300 2026-10-14: Fiscal Multipliers | "made up words here"].';
  o.onText?.(text.slice(0, 10));
  o.onText?.(text.slice(10));
  return { text };
};

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-data-"));
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-notes-")); // empty: app should fall back to samples
  const app = createApp({ runner, notesDir, sampleDir: path.resolve("sample-notes"), dataDir });
  await new Promise<void>((r) => (server = app.listen(0, () => r())));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());

const state = () => fetch(`${base}/api/state`).then((r) => r.json());
async function chat(body: object) {
  const res = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, events: [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => [m[1], JSON.parse(m[2])] as const) };
}

describe("api", () => {
  it("falls back to sample notes and lists course counts", async () => {
    const s = await state();
    expect(s).toMatchObject({ source: "samples", demo: false, total: 21, streak: 0 });
    expect(s.courses.find((c: any) => c.id === "CLUB").count).toBe(3);
  });

  it("scopes chat to a course, streams, validates citations and persists history", async () => {
    const { events } = await chat({ course: "ECON300", question: "What is the multiplier?" });
    expect(events.map((e) => e[0])).toEqual(["meta", "delta", "delta", "done"]);
    const meta = events[0][1] as any;
    expect(meta.notesUsed).toHaveLength(3);
    expect(meta.notesUsed.every((n: any) => n.id.startsWith("ECON300/"))).toBe(true);
    expect(lastPrompt).not.toContain("ECON301");
    expect((events[3][1] as any).citations.map((c: any) => c.status)).toEqual(["ok", "quote_not_found"]);

    const saved = await (await fetch(`${base}/api/chats/ECON300`)).json();
    expect(saved.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    // sample-note chats are stored under their own key
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dataDir, "chats.json"), "utf8")))).toEqual(["sample:ECON300"]);
    expect((await state()).streak).toBe(1);

    await chat({ course: "ECON300", question: "follow up" });
    expect(lastPrompt).toContain("Student: What is the multiplier?");
  });

  it("switches to real notes once they exist, unless demo mode is on", async () => {
    fs.mkdirSync(path.join(notesDir, "ECON300"));
    fs.writeFileSync(path.join(notesDir, "ECON300", "2026-10-24_real.md"), "---\ntitle: Real\n---\nreal");
    expect((await state())).toMatchObject({ source: "notes", total: 1 });
    expect(await (await fetch(`${base}/api/chats/ECON300`)).json()).toEqual([]);
    await fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demo: true }) });
    expect((await state())).toMatchObject({ source: "samples", demo: true, total: 21 });
  });

  it("'all' scope sends every course; bad input is rejected", async () => {
    const { events } = await chat({ course: "all", question: "anything" });
    expect((events[0][1] as any).notesUsed).toHaveLength(21);
    expect((await chat({ course: "nope", question: "x" })).status).toBe(400);
  });

  it("returns friendly errors", async () => {
    fail = true;
    const { events } = await chat({ course: "CLUB", question: "x" });
    fail = false;
    expect(events.at(-1)?.[0]).toBe("error");
    expect((events.at(-1)?.[1] as any).message).toMatch(/isn't logged in/);
  });

  it("serves a note and 404s unknown ones", async () => {
    const ok = await fetch(`${base}/api/notes/ECON300/2026-10-14_sample-fiscal-multipliers.md`);
    expect((await ok.json()).title).toBe("Fiscal Multipliers");
    expect((await fetch(`${base}/api/notes/ECON300/missing.md`)).status).toBe(404);
  });
});
