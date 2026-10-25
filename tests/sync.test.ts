import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSync, extractJsonArray, stripPrefix, slugify } from "../src/sync";
import type { Runner } from "../src/claude";

const fakeRunner = (): { runner: Runner; calls: string[] } => {
  const calls: string[] = [];
  const runner: Runner = async (o) => {
    calls.push(o.prompt);
    if (o.prompt.startsWith("List my Granola")) {
      return {
        text: '```json\n[{"id":"m1","title":"ECON300: IS-LM review","date":"2026-10-20"},{"id":"m2","title":"Coffee with Sam","date":"2026-10-21"},{"id":"m3","title":"CLUB Pitch night","date":"2026-10-22"}]\n```',
      };
    }
    if (o.prompt.includes('"m3"')) return { text: "(no notes)" };
    return { text: "## Notes\n- point one" };
  };
  return { runner, calls };
};

describe("sync", () => {
  it("routes, writes, dedupes and reports", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-sync-"));
    const { runner, calls } = fakeRunner();
    const r1 = await runSync({ runner, notesDir: dir, now: new Date("2026-10-25") });
    expect(r1.added.map((a) => `${a.course}/${a.file}`)).toEqual(["ECON300/2026-10-20_is-lm-review.md", "unsorted/2026-10-21_coffee-with-sam.md"]);
    expect(r1.skipped).toEqual([{ title: "CLUB Pitch night", reason: "no notes" }]);
    const text = fs.readFileSync(path.join(dir, "ECON300", "2026-10-20_is-lm-review.md"), "utf8");
    expect(text).toContain("granola_id: m1");
    expect(text).toContain("point one");

    const callsBefore = calls.length;
    const r2 = await runSync({ runner, notesDir: dir, now: new Date("2026-10-25") });
    expect(r2.added).toHaveLength(0);
    expect(r2.skipped.filter((s) => s.reason === "already synced")).toHaveLength(2);
    // second run only re-lists, plus retries the empty one
    expect(calls.length - callsBefore).toBe(2);
  });

  it("records per-meeting errors without aborting", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-sync-"));
    const runner: Runner = async (o) => {
      if (o.prompt.startsWith("List")) return { text: '[{"id":"a","title":"ECON301 x","date":"2026-10-20"},{"id":"b","title":"MGMT220 y","date":"2026-10-21"}]' };
      if (o.prompt.includes('"a"')) throw new Error("boom");
      return { text: "ok" };
    };
    const r = await runSync({ runner, notesDir: dir });
    expect(r.errors).toEqual([{ title: "ECON301 x", error: "boom" }]);
    expect(r.added).toHaveLength(1);
  });

  it("helpers", () => {
    expect(extractJsonArray('here: [1,2] done')).toEqual([1, 2]);
    expect(() => extractJsonArray("nothing")).toThrow();
    expect(stripPrefix("ECON 300 - Fiscal")).toBe("Fiscal");
    expect(stripPrefix("CLUB: Pitch")).toBe("Pitch");
    expect(slugify("A  B/C!")).toBe("a-b-c");
  });
});
