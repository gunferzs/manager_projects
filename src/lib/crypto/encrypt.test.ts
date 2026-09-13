import test from "node:test";
import assert from "node:assert/strict";
import { encryptString, decryptString } from "./encrypt";

test("roundtrip and wrong key fails", () => {
  const enc = encryptString("JBSWY3DPEHPK3PXP", "master-key-32bytes-minimum-ok!!");
  assert.equal(enc.includes("JBSWY3DPEHPK3PXP"), false);
  assert.equal(decryptString(enc, "master-key-32bytes-minimum-ok!!"), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decryptString(enc, "other-key-32bytes-minimum-ok!!!!"));
});
