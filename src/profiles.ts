import type { Course, ProfileId } from "./courses.js";

export interface ProfileInfo {
  label: string;
  /** Extra answer rules added to the system prompt for courses of this type. */
  guidance: string;
}

export const PROFILE_INFO: Record<ProfileId, ProfileInfo> = {
  "quant-econ": {
    label: "Quantitative economics",
    guidance:
      "Keep the professor's notation and formulas exactly as written in the notes. Put each formula on its own line, define its symbols, " +
      "and walk through a numeric example only when the notes contain one.",
  },
  finance: {
    label: "Finance",
    guidance:
      "Keep formulas and notation from the notes (for example NPV, WACC, CAPM) and show calculations step by step only as they appear in the notes. " +
      "You explain concepts and calculations from the notes; never give personalized investment advice or tell the student to buy or sell anything.",
  },
  accounting: {
    label: "Accounting",
    guidance:
      "Keep account names and Dr/Cr layouts exactly as written in the notes. Show journal entries as small tables with Debit and Credit columns.",
  },
  general: {
    label: "General",
    guidance: "Keep the professor's framing and vocabulary, and quote key definitions word for word when the notes give them.",
  },
};

/** One line per profile in play, so an all-courses question gets the right rules for each course's notes. */
export function profileGuidance(courses: Course[], courseIdsInPlay: string[]): string {
  const byProfile = new Map<ProfileId, string[]>();
  for (const id of courseIdsInPlay) {
    const c = courses.find((x) => x.id === id);
    if (!c) continue;
    byProfile.set(c.profile, [...(byProfile.get(c.profile) ?? []), id]);
  }
  return [...byProfile.entries()]
    .map(([p, ids]) => `- For notes from ${ids.join(", ")} (${PROFILE_INFO[p].label}): ${PROFILE_INFO[p].guidance}`)
    .join("\n");
}
