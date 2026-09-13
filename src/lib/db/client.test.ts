import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./client";
import { withTempDb } from "../test/temp-db";

function listTables(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row: { name: string }) => row.name);
}

test("migrate applies schema to an empty database file", () => {
  const dbPath = path.join(
    os.tmpdir(),
    `manager-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
  const db = new Database(dbPath);
  try {
    assert.deepEqual(listTables(db), []);

    migrate(db);

    const tables = listTables(db);
    assert.ok(tables.includes("auth_settings"));
    assert.ok(tables.includes("auth_challenges"));
    assert.ok(tables.includes("sessions"));
    assert.ok(tables.includes("projects"));
    assert.ok(tables.includes("project_services"));
    assert.ok(tables.includes("jobs"));
    assert.ok(tables.includes("job_logs"));
    assert.ok(tables.includes("audit_events"));
    assert.equal(tables.includes("servers"), false);
    assert.equal(tables.includes("deployments"), false);
  } finally {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
});

test("migrate creates auth_settings and rejects servers table", () => {
  const { db, close } = withTempDb();
  try {
    const tables = listTables(db);
    assert.ok(tables.includes("auth_settings"));
    assert.ok(tables.includes("auth_challenges"));
    assert.ok(tables.includes("sessions"));
    assert.ok(tables.includes("projects"));
    assert.ok(tables.includes("project_services"));
    assert.ok(tables.includes("jobs"));
    assert.ok(tables.includes("job_logs"));
    assert.ok(tables.includes("audit_events"));
    assert.equal(tables.includes("servers"), false);
    assert.equal(tables.includes("deployments"), false);
    const cols = db.prepare("PRAGMA table_info(auth_settings)").all() as Array<{ name: string }>;
    assert.deepEqual(
      cols.map((c) => c.name).sort(),
      ["failed_attempts", "id", "key_hash", "locked_until", "totp_enabled", "totp_secret_encrypted", "updated_at"],
    );
  } finally {
    close();
  }
});
