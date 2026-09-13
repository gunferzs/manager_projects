import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

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
