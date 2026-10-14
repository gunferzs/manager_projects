import test from "node:test";
import assert from "node:assert/strict";
import { buildComposePortOverlay } from "./port-overlay";

test("overlay remaps ports and points NEXTAUTH_URL at machine loopback", () => {
  const yaml = buildComposePortOverlay(
    [{ service: "app", hostPort: 3003, containerPort: 3000 }],
    "127.0.0.1",
  );
  assert.match(yaml, /ports: !override/);
  assert.match(yaml, /"3003:3000"/);
  assert.match(yaml, /NEXTAUTH_URL: http:\/\/127\.0\.0\.1:3003/);
});

test("overlay points NEXTAUTH_URL at LAN host for ui services", () => {
  const yaml = buildComposePortOverlay(
    [
      { service: "app", hostPort: 3003, containerPort: 3000 },
      { service: "postgres", hostPort: 5435, containerPort: 5432 },
    ],
    "192.168.1.89",
  );
  assert.match(yaml, /NEXTAUTH_URL: http:\/\/192\.168\.1\.89:3003/);
  assert.doesNotMatch(yaml, /postgres:[\s\S]*NEXTAUTH_URL/);
});
