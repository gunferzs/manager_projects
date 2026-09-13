import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";
import { confirmTotpEnroll, generateTotpCode, verifyTotp } from "./totp";

const KEY = "sixteen-chars-ok";
const MASTER = "master-key-32bytes-minimum-ok!!";

function restoreMasterKey(prev: string | undefined): void {
  if (prev === undefined) {
    delete process.env.MANAGER_MASTER_KEY;
  } else {
    process.env.MANAGER_MASTER_KEY = prev;
  }
}

test("valid key with totp returns challenge not session", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = MASTER;
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    assert.equal(confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret)), true);
    const res = await submitKey(db, KEY, "10.0.0.8");
    assert.equal(res.kind, "challenge");
    const sessions = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    assert.equal(sessions.n, 1); // only setup session
  } finally {
    close();
    restoreMasterKey(prevMasterKey);
  }
});

test("totp from other ip is ip_mismatch and does not create session", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = MASTER;
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    const res = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.9");
    assert.equal(res.kind, "ip_mismatch");
    const n = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    assert.equal(n, 1);
  } finally {
    close();
    restoreMasterKey(prevMasterKey);
  }
});

test("five bad totp codes burn challenge", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = MASTER;
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    for (let i = 0; i < 5; i++) {
      const res = await verifyTotp(db, ch.token, "000000", "10.0.0.8");
      assert.equal(res.kind, "invalid");
    }
    const sixth = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.8");
    assert.equal(sixth.kind, "expired");
  } finally {
    close();
    restoreMasterKey(prevMasterKey);
  }
});

test("matching ip and code creates session and deletes challenge", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = MASTER;
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    const res = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.8");
    assert.equal(res.kind, "session");
    const left = (db.prepare("SELECT COUNT(*) AS n FROM auth_challenges").get() as { n: number }).n;
    assert.equal(left, 0);
  } finally {
    close();
    restoreMasterKey(prevMasterKey);
  }
});
