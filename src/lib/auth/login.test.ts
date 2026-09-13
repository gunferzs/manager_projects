import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";

test("wrong key is invalid; right key without totp is session", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const bad = await submitKey(db, "wrong-key-not-it", "1.1.1.1");
    assert.equal(bad.kind, "invalid");
    const good = await submitKey(db, "sixteen-chars-ok", "1.1.1.1");
    assert.equal(good.kind, "session");
    if (good.kind === "session") assert.ok(good.token.length >= 32);
    const row = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    assert.equal(row.n, 2); // setup session + login session
  } finally {
    close();
  }
});

test("eighth wrong key locks for 15 minutes", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const now = new Date("2026-09-13T10:00:00Z");
    for (let i = 0; i < 7; i++) {
      const res = await submitKey(db, "wrong-key-not-it", "1.1.1.1", now);
      assert.equal(res.kind, "invalid");
    }
    const locked = await submitKey(db, "wrong-key-not-it", "1.1.1.1", now);
    assert.equal(locked.kind, "locked");
    if (locked.kind === "locked") {
      assert.equal(locked.until.toISOString(), "2026-09-13T10:15:00.000Z");
    }
    const still = await submitKey(db, "sixteen-chars-ok", "1.1.1.1", now);
    assert.equal(still.kind, "locked");
  } finally {
    close();
  }
});
