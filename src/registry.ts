import fs from "node:fs";
import path from "node:path";
import { DEFAULT_COURSES, PALETTE, PROFILES, UNSORTED, type ColorName, type Course, type ProfileId } from "./courses.js";

export class RegistryError extends Error {}

const file = (dataDir: string) => path.join(dataDir, "courses.json");
const ID_RE = /^[A-Za-z][A-Za-z0-9-]{1,19}$/;
const RESERVED = new Set(["all", "unsorted"]);

function isCourse(x: any): x is Course {
  return x && typeof x.id === "string" && ID_RE.test(x.id) && typeof x.name === "string" && PROFILES.includes(x.profile);
}

/** The saved course list, or the defaults when nothing has been saved yet. Unsorted is always present. */
export function loadRegistry(dataDir: string): Course[] {
  let courses: Course[];
  try {
    const raw = JSON.parse(fs.readFileSync(file(dataDir), "utf8"));
    courses = (Array.isArray(raw) ? raw : []).filter(isCourse).filter((c) => !RESERVED.has(c.id.toLowerCase()));
    if (!courses.length) throw new Error("empty");
  } catch {
    return DEFAULT_COURSES.map((c) => ({ ...c }));
  }
  return [...courses, { ...UNSORTED }];
}

function save(dataDir: string, courses: Course[]) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = file(dataDir) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(courses.filter((c) => c.id !== "unsorted"), null, 2));
  fs.renameSync(tmp, file(dataDir));
}

function nextColor(courses: Course[]): ColorName {
  const used = new Set(courses.map((c) => c.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[courses.length % PALETTE.length];
}

export interface CourseInput {
  id: string;
  name: string;
  semester?: string;
  profile?: ProfileId;
  color?: ColorName;
  keywords?: string[];
  granolaFolder?: string;
}

function clean(input: Partial<CourseInput>): Partial<Course> {
  const out: Partial<Course> = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > 60) throw new RegistryError("Course name must be 1 to 60 characters.");
    out.name = name;
  }
  if (input.semester !== undefined) out.semester = String(input.semester).trim().slice(0, 40) || undefined;
  if (input.profile !== undefined) {
    if (!PROFILES.includes(input.profile)) throw new RegistryError(`Course type must be one of: ${PROFILES.join(", ")}.`);
    out.profile = input.profile;
  }
  if (input.color !== undefined) {
    if (!(PALETTE as readonly string[]).includes(input.color)) throw new RegistryError("Unknown color.");
    out.color = input.color;
  }
  if (input.keywords !== undefined) {
    out.keywords = (Array.isArray(input.keywords) ? input.keywords : []).map((k) => String(k).trim()).filter(Boolean).slice(0, 20);
  }
  if (input.granolaFolder !== undefined) out.granolaFolder = String(input.granolaFolder).trim().slice(0, 80) || undefined;
  return out;
}

export function addCourse(dataDir: string, input: CourseInput): Course {
  const courses = loadRegistry(dataDir);
  const id = String(input.id ?? "").trim().toUpperCase();
  if (!ID_RE.test(id)) throw new RegistryError("Course code must start with a letter and use 2 to 20 letters, digits or dashes (e.g. FIN310).");
  if (RESERVED.has(id.toLowerCase())) throw new RegistryError(`"${id}" is reserved.`);
  if (courses.some((c) => c.id.toUpperCase() === id)) throw new RegistryError(`${id} already exists.`);
  const fields = clean({ ...input, name: input.name ?? "" });
  const course: Course = { id, name: fields.name!, profile: "general", color: nextColor(courses), ...fields };
  save(dataDir, [...courses, course]);
  return course;
}

export function updateCourse(dataDir: string, id: string, patch: Partial<CourseInput> & { archived?: boolean }): Course {
  const courses = loadRegistry(dataDir);
  const i = courses.findIndex((c) => c.id === id);
  if (i < 0 || id === "unsorted") throw new RegistryError(`No course ${id}.`);
  const fields = clean(patch);
  const updated: Course = { ...courses[i], ...fields };
  if (patch.archived !== undefined) updated.archived = !!patch.archived || undefined;
  courses[i] = updated;
  save(dataDir, courses);
  return updated;
}
