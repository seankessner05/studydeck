import fs from "node:fs";
import path from "node:path";
import type { Citation } from "./citations.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  citations?: Citation[];
  notesUsed?: { id: string; label: string }[];
  mode?: "all" | "ranked";
  useGeneral?: boolean;
  error?: boolean;
}

export type ChatStore = Record<string, ChatMessage[]>;

export function chatsFile(dataDir: string) {
  return path.join(dataDir, "chats.json");
}

export function loadChats(dataDir: string): ChatStore {
  try {
    return JSON.parse(fs.readFileSync(chatsFile(dataDir), "utf8"));
  } catch {
    return {};
  }
}

export function saveChats(dataDir: string, store: ChatStore) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = chatsFile(dataDir) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, chatsFile(dataDir));
}

export function appendMessage(dataDir: string, course: string, msg: ChatMessage) {
  const store = loadChats(dataDir);
  (store[course] ??= []).push(msg);
  saveChats(dataDir, store);
}

export function clearChat(dataDir: string, course: string) {
  const store = loadChats(dataDir);
  delete store[course];
  saveChats(dataDir, store);
}
