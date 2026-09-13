import test from "node:test";
import assert from "node:assert/strict";
import { hashSecret, verifySecret } from "./hash";

test("argon2 hash verifies and does not store plaintext", async () => {
  const hash = await hashSecret("correct-horse-battery");
  assert.equal(hash.includes("correct-horse-battery"), false);
  assert.equal(await verifySecret("correct-horse-battery", hash), true);
  assert.equal(await verifySecret("wrong", hash), false);
});
