import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup, hasKey } from "./setup";

test("setup rejects short key and second setup", async () => {
  const { db, close } = withTempDb();
  try {
    assert.equal(hasKey(db), false);
    await assert.rejects(() => createSetup(db, "short"), (e: { code: string }) => e.code === "KEY_TOO_SHORT");
    const first = await createSetup(db, "sixteen-chars-ok");
    assert.equal(typeof first.token, "string");
    assert.equal(hasKey(db), true);
    await assert.rejects(() => createSetup(db, "sixteen-chars-ok"), (e: { code: string }) => e.code === "ALREADY_SETUP");
  } finally {
    close();
  }
});
