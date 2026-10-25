export interface Course {
  id: string;
  name: string;
}

export const COURSES: Course[] = [
  { id: "ECON300", name: "Macroeconomics" },
  { id: "ECON301", name: "Microeconomics" },
  { id: "ECON196", name: "Accounting" },
  { id: "MGMT220", name: "Social Innovation" },
  { id: "CLUB", name: "Clubs" },
  { id: "EVENT", name: "Events" },
  { id: "ATHLETICS", name: "Athletics" },
  { id: "unsorted", name: "Unsorted" },
];

export const COURSE_IDS = COURSES.map((c) => c.id);

/** Route a meeting title like "ECON 300 - Fiscal policy" to a course id, or "unsorted". */
export function routeTitle(title: string): string {
  const m = title.trim().match(/^\[?\s*(ECON|MGMT)\s*[-_ ]?\s*(\d{3})\b/i);
  if (m) {
    const id = `${m[1].toUpperCase()}${m[2]}`;
    if (COURSE_IDS.includes(id)) return id;
    return "unsorted";
  }
  const w = title.trim().match(/^\[?\s*(CLUB|EVENT|ATHLETICS)\b/i);
  if (w) return w[1].toUpperCase();
  return "unsorted";
}
