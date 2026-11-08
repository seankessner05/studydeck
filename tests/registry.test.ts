import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addCourse, loadRegistry, updateCourse, RegistryError } from "../src/registry";
import { DEFAULT_COURSES, routeTitle, stripCoursePrefix, type Course } from "../src/courses";
import { profileGuidance } from "../src/profiles";
import { buildSystemPrompt } from "../src/prompt";
import { routeMeeting } from "../src/sync";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sd-reg-"));

describe("course registry", () => {
  it("starts from the defaults and always includes unsorted", () => {
    const ids = loadRegistry(tmp()).map((c) => c.id);
    expect(ids).toEqual(DEFAULT_COURSES.map((c) => c.id));
    expect(ids.at(-1)).toBe("unsorted");
  });

  it("adds a course, normalizes the code, and persists it", () => {
    const dir = tmp();
    const c = addCourse(dir, { id: " fin310 ", name: "Corporate Finance", semester: "Spring 2027", profile: "finance" });
    expect(c).toMatchObject({ id: "FIN310", profile: "finance" });
    expect(loadRegistry(dir).some((x) => x.id === "FIN310")).toBe(true);
    // the file never stores the built-in Unsorted entry
    expect(JSON.parse(fs.readFileSync(path.join(dir, "courses.json"), "utf8")).some((x: Course) => x.id === "unsorted")).toBe(false);
  });

  it("gives new courses an unused palette color", () => {
    const dir = tmp();
    const used = new Set(loadRegistry(dir).map((c) => c.color));
    expect(used.has(addCourse(dir, { id: "FIN310", name: "Finance" }).color)).toBe(false);
  });

  it("rejects bad input", () => {
    const dir = tmp();
    expect(() => addCourse(dir, { id: "ECON300", name: "Dupe" })).toThrow(/already exists/);
    expect(() => addCourse(dir, { id: "unsorted", name: "x" })).toThrow(RegistryError);
    expect(() => addCourse(dir, { id: "../etc", name: "x" })).toThrow(/Course code/);
    expect(() => addCourse(dir, { id: "OK1", name: "" })).toThrow(/Course name/);
    expect(() => addCourse(dir, { id: "OK2", name: "x", profile: "nope" as any })).toThrow(/Course type/);
  });

  it("archives and unarchives, and refuses to edit unsorted", () => {
    const dir = tmp();
    expect(updateCourse(dir, "CLUB", { archived: true }).archived).toBe(true);
    expect(loadRegistry(dir).find((c) => c.id === "CLUB")?.archived).toBe(true);
    expect(updateCourse(dir, "CLUB", { archived: false }).archived).toBeUndefined();
    expect(() => updateCourse(dir, "unsorted", { name: "x" })).toThrow();
    expect(() => updateCourse(dir, "NOPE", { name: "x" })).toThrow(/No course/);
  });

  it("survives a corrupted file by falling back to defaults", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "courses.json"), "{not json");
    expect(loadRegistry(dir).length).toBe(DEFAULT_COURSES.length);
  });
});

describe("routing with a registry", () => {
  const courses: Course[] = [
    { id: "ECON301", name: "Micro", profile: "quant-econ", color: "sky", keywords: ["monopoly", "elasticity"] },
    { id: "FIN310", name: "Corp Fin", profile: "finance", color: "rose", keywords: ["WACC"] },
    { id: "OLD100", name: "Old", profile: "general", color: "lime", archived: true },
    { id: "unsorted", name: "Unsorted", profile: "general", color: "slate" },
  ];
  it("matches codes, spaced codes and keywords; skips archived courses", () => {
    expect(routeTitle("FIN 310: valuation", courses)).toBe("FIN310");
    expect(routeTitle("Lecture on monopoly power", courses)).toBe("ECON301");
    expect(routeTitle("Computing WACC", courses)).toBe("FIN310");
    expect(routeTitle("OLD100 review", courses)).toBe("unsorted");
    expect(routeTitle("Coffee chat", courses)).toBe("unsorted");
  });
  it("does not guess when keywords point at two courses", () => {
    const two = [...courses, { id: "ECON400", name: "x", profile: "general", color: "teal", keywords: ["monopoly"] } as Course];
    expect(routeTitle("monopoly", two)).toBe("unsorted");
  });
  it("accepts Claude's suggestion only for active real courses", () => {
    expect(routeMeeting({ id: "1", title: "Chat", date: "2026-01-01", course: "FIN310" }, courses)).toBe("FIN310");
    expect(routeMeeting({ id: "1", title: "Chat", date: "2026-01-01", course: "OLD100" }, courses)).toBe("unsorted");
    expect(routeMeeting({ id: "1", title: "Chat", date: "2026-01-01", course: "BOGUS" }, courses)).toBe("unsorted");
  });
  it("strips any registry prefix from titles", () => {
    expect(stripCoursePrefix("FIN-310 - Valuation", courses)).toBe("Valuation");
    expect(stripCoursePrefix("FIN310", courses)).toBe("FIN310");
  });
});

describe("profiles", () => {
  it("adds per-profile rules only for courses in play", () => {
    const g = profileGuidance(DEFAULT_COURSES, ["ECON300", "ECON301", "ECON196"]);
    expect(g).toContain("ECON300, ECON301 (Quantitative economics)");
    expect(g).toContain("ECON196 (Accounting)");
    expect(g).not.toContain("Finance");
    expect(buildSystemPrompt(false, g)).toContain("COURSE STYLE");
    expect(buildSystemPrompt(false)).not.toContain("COURSE STYLE");
  });
  it("finance guidance forbids investment advice", () => {
    const g = profileGuidance([{ id: "FIN310", name: "x", profile: "finance", color: "rose" }], ["FIN310"]);
    expect(g).toMatch(/never give personalized investment advice/);
  });
});
