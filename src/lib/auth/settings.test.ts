import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";
import { changeKey, confirmPendingTotp, startTotpEnroll } from "./settings";
import { generateTotpCode, isTotpEnabled } from "./totp";

const MASTER = "master-key-32bytes-minimum-ok!!";

test("changeKey revokes other sessions", async () => {
  const { db, close } = withTempDb();
  try {
    const setup = await createSetup(db, "sixteen-chars-ok");
    const other = await submitKey(db, "sixteen-chars-ok", "1.1.1.1");
    if (other.kind !== "session") throw new Error("session");
    const res = await changeKey(db, {
      oldKey: "sixteen-chars-ok",
      newKey: "another-sixteen-xx",
      keepSessionToken: setup.token,
      masterKey: MASTER,
    });
    assert.equal(res.ok, true);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    assert.equal(n, 1);
  } finally {
    close();
  }
});

test("totp enroll start returns secret once; confirm enables totp", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const started = startTotpEnroll(db, MASTER);
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error("enroll");
    assert.ok(started.secret.length > 0);
    assert.ok(started.otpauthUrl.includes(started.secret));
    assert.equal(isTotpEnabled(db), false);
    const pending = db
      .prepare("SELECT value FROM app_settings WHERE key = 'pending_totp_secret'")
      .get() as { value: string } | undefined;
    assert.ok(pending?.value);
    assert.equal(pending.value.includes(started.secret), false);

    const confirmed = confirmPendingTotp(db, MASTER, generateTotpCode(started.secret), "1.1.1.1");
    assert.equal(confirmed.ok, true);
    assert.equal(isTotpEnabled(db), true);
    const left = db
      .prepare("SELECT value FROM app_settings WHERE key = 'pending_totp_secret'")
      .get();
    assert.equal(left, undefined);
  } finally {
    close();
  }
});

test("changeKey rejects wrong old key and keeps sessions", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const res = await changeKey(db, {
      oldKey: "wrong-key-not-itxx",
      newKey: "another-sixteen-xx",
      keepSessionToken: "unused",
      masterKey: MASTER,
    });
    assert.equal(res.ok, false);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    assert.equal(n, 1);
  } finally {
    close();
  }
});
