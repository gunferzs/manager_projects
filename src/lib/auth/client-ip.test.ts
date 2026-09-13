import test from "node:test";
import assert from "node:assert/strict";
import { readClientIp } from "./client-ip";

test("trusts x-forwarded-for only from loopback", () => {
  assert.equal(
    readClientIp({ remoteAddress: "127.0.0.1", forwardedFor: "203.0.113.4, 10.0.0.1" }),
    "203.0.113.4",
  );
  assert.equal(
    readClientIp({ remoteAddress: "198.51.100.2", forwardedFor: "203.0.113.4" }),
    "198.51.100.2",
  );
  assert.equal(readClientIp({ remoteAddress: "::1", forwardedFor: "203.0.113.4" }), "203.0.113.4");
});
