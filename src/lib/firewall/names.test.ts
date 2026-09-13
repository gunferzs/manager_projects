import test from "node:test";
import assert from "node:assert/strict";
import { RULE_PREFIX, ruleName } from "./names";

test("ruleName uses prefix slug port", () => {
  assert.equal(ruleName("volleyball", 3000), "mgrproj-volleyball-3000");
});

test("RULE_PREFIX is mgrproj-", () => {
  assert.equal(RULE_PREFIX, "mgrproj-");
});
