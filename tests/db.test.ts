import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MEMORY, currentVersion, getMeta, migrate, openDb, setMeta } from "../src/library/db";
import { MIGRATIONS, type Migration } from "../src/library/migrations";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sd-db-")), "library.db");
const m = (version: number, sql: string, name = `m${version}`): Migration => ({ version, name, sql });

describe("sqlite environment", () => {
  it("has full-text search with stemming (the library depends on it)", () => {
    const db = new DatabaseSync(MEMORY);
    db.exec(`CREATE VIRTUAL TABLE t USING fts5(body, tokenize = 'porter unicode61')`);
    db.prepare("INSERT INTO t(body) VALUES (?)").run("The spending multiplier amplifies fiscal policy");
    expect(db.prepare("SELECT count(*) AS n FROM t WHERE t MATCH ?").get("multipliers")).toMatchObject({ n: 1 });
  });
});

describe("migrations", () => {
  it("creates a fresh database at the latest version", () => {
    const db = openDb(tmpFile());
    expect(currentVersion(db)).toBe(MIGRATIONS.length);
    expect(getMeta(db, "created_at")).toBeTruthy();
    db.close();
  });

  it("is idempotent and keeps data across reopen", () => {
    const file = tmpFile();
    const a = openDb(file);
    setMeta(a, "hello", "world");
    a.close();
    const b = openDb(file);
    expect(getMeta(b, "hello")).toBe("world");
    expect(currentVersion(b)).toBe(MIGRATIONS.length);
    b.close();
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.includes(".bak"))).toEqual([]);
  });

  it("backs up an existing database before upgrading it", () => {
    const file = tmpFile();
    const v1 = [m(1, "CREATE TABLE a (x TEXT)")];
    const v2 = [...v1, m(2, "CREATE TABLE b (y TEXT)")];
    const db = openDb(file, v1);
    db.prepare("INSERT INTO a VALUES ('keep me')").run();
    db.close();

    const up = openDb(file, v2);
    expect(currentVersion(up)).toBe(2);
    up.close();
    const backup = new DatabaseSync(`${file}.bak-v1`);
    expect(backup.prepare("SELECT x FROM a").get()).toMatchObject({ x: "keep me" });
    expect(currentVersion(backup)).toBe(1);
    backup.close();
  });

  it("rolls a failing migration back completely, including the version", () => {
    const file = tmpFile();
    openDb(file, [m(1, "CREATE TABLE a (x TEXT)")]).close();
    const broken = [m(1, "CREATE TABLE a (x TEXT)"), m(2, "CREATE TABLE b (y TEXT); INSERT INTO missing VALUES (1)", "broken")];
    expect(() => openDb(file, broken)).toThrow(/Migration 2 \(broken\) failed/);
    const db = new DatabaseSync(file);
    expect(currentVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
    db.close();
  });

  it("refuses a database made by a newer app, and out-of-order migration lists", () => {
    const file = tmpFile();
    openDb(file, [m(1, "CREATE TABLE a (x TEXT)"), m(2, "CREATE TABLE b (y TEXT)")]).close();
    expect(() => openDb(file, [m(1, "CREATE TABLE a (x TEXT)")])).toThrow(/newer version/);
    expect(() => migrate(new DatabaseSync(MEMORY), MEMORY, [m(2, "SELECT 1")])).toThrow(/numbered 1, 2, 3/);
  });

  it("supports an in-memory database for tests", () => {
    const db = openDb(MEMORY);
    expect(currentVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });
});
