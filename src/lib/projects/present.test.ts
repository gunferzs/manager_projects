import assert from "node:assert/strict";
import { test } from "node:test";
import { firewallPortsForSlug } from "./present";

test("firewallPortsForSlug reads ports for the project slug", () => {
  assert.deepEqual(firewallPortsForSlug(["mgrproj-neuro-3000", "mgrproj-other-80"], "neuro"), [3000]);
});
