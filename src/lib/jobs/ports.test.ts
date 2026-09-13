import test from "node:test";
import assert from "node:assert/strict";
import { findPortOwner, parseNetstatListening } from "./ports";
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

test("parseNetstatListening maps pid to process name", () => {
  const lines = [
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4242",
    "  TCP    127.0.0.1:3100         0.0.0.0:0              LISTENING       7",
  ].join("\n");
  const names = new Map([["4242", "wiremock-gui"]]);
  const parsed = parseNetstatListening(lines, names);
  assert.equal(findPortOwner(3000, parsed), "wiremock-gui");
  assert.equal(findPortOwner(3100, parsed), "pid 7");
});
