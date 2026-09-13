import test from "node:test";
import assert from "node:assert/strict";
import { findPortOwner } from "./ports";
import type { PortInspect } from "./types";

const inspect: PortInspect[] = [
  { port: 3000, kind: "tcp", owner: "wiremock-gui" },
  { port: 8080, kind: "tcp", owner: "other" },
];

test("findPortOwner returns the matching owner", () => {
  assert.equal(findPortOwner(3000, inspect), "wiremock-gui");
  assert.equal(findPortOwner(8080, inspect), "other");
});

test("findPortOwner returns null when the port is free", () => {
  assert.equal(findPortOwner(3100, inspect), null);
  assert.equal(findPortOwner(3000, []), null);
});
