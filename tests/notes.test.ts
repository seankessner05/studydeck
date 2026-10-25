import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseNote, loadNotes, listCourses, readNote, resolveNotesDir } from "../src/notes";

describe("notes", () => {
  it("parses frontmatter and falls back to the filename", () => {
    const n = parseNote("ECON300", "2026-10-14_sample-fiscal.md", "---\ntitle: Fiscal Multipliers\nsample: true\n---\nbody here");
    expect(n).toMatchObject({ title: "Fiscal Multipliers", date: "2026-10-14", sample: true, body: "body here", id: "ECON300/2026-10-14_sample-fiscal.md" });
    const bare = parseNote("CLUB", "2026-01-02_pitch-night.md", "no frontmatter");
    expect(bare).toMatchObject({ title: "pitch night", date: "2026-01-02", sample: false });
  });

  it("loads real sample notes: 3 per course, 21 total", () => {
    const { courses, total } = listCourses(path.resolve("sample-notes"));
    expect(total).toBe(21);
    for (const id of ["ECON300", "ECON301", "ECON196", "MGMT220", "CLUB", "EVENT", "ATHLETICS"]) {
      expect(courses.find((c) => c.id === id)?.count).toBe(3);
    }
    expect(loadNotes("all", path.resolve("sample-notes")).every((n) => n.sample)).toBe(true);
  });

  it("rejects path traversal and unknown courses", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-"));
    fs.mkdirSync(path.join(dir, "CLUB"));
    fs.writeFileSync(path.join(dir, "CLUB", "2026-01-01_a.md"), "hi");
    expect(readNote("CLUB", "2026-01-01_a.md", dir)?.body).toBe("hi");
    expect(readNote("CLUB", "../CLUB/2026-01-01_a.md", dir)).toBeNull();
    expect(readNote("../etc", "passwd.md", dir)).toBeNull();
  });

  it("falls back to sample notes when ./notes is empty, and demo mode forces samples", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "sd-empty-"));
    const real = fs.mkdtempSync(path.join(os.tmpdir(), "sd-real-"));
    fs.mkdirSync(path.join(real, "ECON300"));
    fs.writeFileSync(path.join(real, "ECON300", "2026-10-01_real.md"), "real note");
    expect(resolveNotesDir(empty, "S", false)).toEqual({ dir: "S", source: "samples" });
    expect(resolveNotesDir(real, "S", false)).toEqual({ dir: real, source: "notes" });
    expect(resolveNotesDir(real, "S", true)).toEqual({ dir: "S", source: "samples" });
  });
});
