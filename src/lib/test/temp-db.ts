import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb } from "../db/client";

export function withTempDb(): { db: Database.Database; dbPath: string; close(): void } {
  const dbPath = path.join(
    os.tmpdir(),
    `manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
  const db = openDb(dbPath);
  return {
    db,
    dbPath,
    close() {
      db.close();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    },
  };
}
