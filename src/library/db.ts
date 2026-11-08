import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, type Migration } from "./migrations.js";

export type Db = DatabaseSync;

export const MEMORY = ":memory:";

export function currentVersion(db: Db): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function validate(migrations: Migration[]) {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migrations must be numbered 1, 2, 3, … in order (found ${m.version} at position ${i + 1}).`);
  });
}

/**
 * Bring the database up to the latest schema. Each migration runs in its own transaction together with the
 * version bump, so a failure leaves the database exactly as it was. An existing database is copied to
 * `<file>.bak-v<N>` before its first pending migration.
 */
export function migrate(db: Db, file: string, migrations: Migration[] = MIGRATIONS): number[] {
  validate(migrations);
  const current = currentVersion(db);
  const latest = migrations.length;
  if (current > latest) {
    throw new Error(`This library was created by a newer version of StudyDeck (schema ${current}, this app knows ${latest}). Update the app.`);
  }
  const pending = migrations.filter((m) => m.version > current);
  if (!pending.length) return [];

  if (file !== MEMORY && current > 0) {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    fs.copyFileSync(file, `${file}.bak-v${current}`);
  }
  for (const m of pending) {
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return pending.map((m) => m.version);
}

export function openDb(file: string, migrations: Migration[] = MIGRATIONS): Db {
  if (file !== MEMORY) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== MEMORY) db.exec("PRAGMA journal_mode = WAL");
  try {
    migrate(db, file, migrations);
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

export function getMeta(db: Db, key: string): string | undefined {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

export function setMeta(db: Db, key: string, value: string) {
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
