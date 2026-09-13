import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { listAuditEvents, sanitizeAuditDetail, writeAudit } from "./log";

test("sanitizeAuditDetail strips secrets", () => {
  const clean = sanitizeAuditDetail({ key: "x", totp: "123", port: 3000 });
  assert.deepEqual(clean, { port: 3000 });
});

test("writeAudit persists sanitized detail", () => {
  const { db, close } = withTempDb();
  try {
    writeAudit(db, {
      action: "login",
      ip: "10.0.0.1",
      outcome: "ok",
      detail: { key: "secret-key", totp: "123456", secret: "s", token: "t", port: 3000 },
    });
    const events = listAuditEvents(db);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].detail, { port: 3000 });
    assert.equal(events[0].action, "login");
  } finally {
    close();
  }
});
