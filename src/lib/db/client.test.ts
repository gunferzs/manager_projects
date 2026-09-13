import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";

test("migrate creates auth_settings and rejects servers table", () => {
  const { db, close } = withTempDb();
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);
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
