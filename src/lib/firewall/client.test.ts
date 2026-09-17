import test from "node:test";
import assert from "node:assert/strict";
import { runFirewall } from "./client";

test("dry-run allow returns ok without loading tsx into a require cycle", async () => {
  const prev = process.env.MGR_FW_DRY;
  process.env.MGR_FW_DRY = "1";
  try {
    const result = await runFirewall({
      action: "allow",
      name: "mgrproj-test-5174",
      port: 5174,
    });
    assert.equal(result.ok, true, result.message);
  } finally {
    if (prev === undefined) delete process.env.MGR_FW_DRY;
    else process.env.MGR_FW_DRY = prev;
  }
});
