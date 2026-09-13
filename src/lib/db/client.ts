import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";
import { getDbPath } from "./paths";

const globalForDb = globalThis as typeof globalThis & { __managerDb?: Database.Database };

export function getRuntimeDb(): Database.Database {
  if (!globalForDb.__managerDb) {
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    globalForDb.__managerDb = openDb(dbPath);
  }
  return globalForDb.__managerDb;
}

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
