import { describe, it, expect } from "vitest";
import { studyStreak, type ChatStore } from "../src/chats";
import { friendlyError } from "../src/claude";

const at = (iso: string) => ({ id: iso, role: "user" as const, text: "q", createdAt: new Date(iso).toISOString() });

describe("study streak", () => {
  const today = new Date(2026, 9, 25, 15);
  it("counts consecutive days across courses", () => {
    const store: ChatStore = { A: [at("2026-10-25T10:00"), at("2026-10-24T10:00")], B: [at("2026-10-23T10:00")] };
    expect(studyStreak(store, today)).toBe(3);
  });
  it("survives until a full day is skipped", () => {
    expect(studyStreak({ A: [at("2026-10-24T10:00")] }, today)).toBe(1);
    expect(studyStreak({ A: [at("2026-10-22T10:00")] }, today)).toBe(0);
  });
  it("ignores assistant messages", () => {
    expect(studyStreak({ A: [{ ...at("2026-10-25T10:00"), role: "assistant" }] }, today)).toBe(0);
  });
});

describe("friendlyError", () => {
  it("maps common CLI failures", () => {
    expect(friendlyError(new Error("spawn claude ENOENT"))).toMatch(/PATH/);
    expect(friendlyError(new Error("rate_limit_error"))).toMatch(/usage limit/);
    expect(friendlyError(new Error("weird"))).toMatch(/weird/);
  });
});
