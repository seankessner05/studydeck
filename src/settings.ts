import fs from "node:fs";
import path from "node:path";

export interface Settings {
  demo: boolean;
}

const file = (dataDir: string) => path.join(dataDir, "settings.json");

export function loadSettings(dataDir: string): Settings {
  try {
    return { demo: false, ...JSON.parse(fs.readFileSync(file(dataDir), "utf8")) };
  } catch {
    return { demo: process.env.STUDYDECK_DEMO === "1" };
  }
}

export function saveSettings(dataDir: string, s: Settings) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file(dataDir), JSON.stringify(s, null, 2));
}
