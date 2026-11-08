import path from "node:path";

/** Where private app data lives (chats, settings, course registry, library, eval reports). Git-ignored. */
export const DATA_DIR = path.resolve(process.env.STUDYDECK_DATA_DIR ?? "data");
