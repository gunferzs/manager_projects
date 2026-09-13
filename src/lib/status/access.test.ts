import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccess } from "./access";

test("none when project is stopped", () => {
  assert.equal(
    resolveAccess({
      status: "stopped",
      binds: [{ port: 3000, address: "0.0.0.0" }],
      firewallPorts: [3000],
    }),
    "none",
  );
});

test("machine when all binds are localhost", () => {
  assert.equal(
    resolveAccess({
      status: "running",
      binds: [
        { port: 3000, address: "127.0.0.1" },
        { port: 5432, address: "::1" },
      ],
      firewallPorts: [],
    }),
    "machine",
  );
});

test("lan when every public bind port is in firewall", () => {
  assert.equal(
    resolveAccess({
      status: "running",
      binds: [
        { port: 3000, address: "0.0.0.0" },
        { port: 8080, address: "::" },
      ],
      firewallPorts: [3000, 8080],
    }),
    "lan",
  );
});

test("lan_unconfirmed when a public port is missing from firewall", () => {
  assert.equal(
    resolveAccess({
      status: "running",
      binds: [
        { port: 3000, address: "0.0.0.0" },
        { port: 8080, address: "::" },
      ],
      firewallPorts: [3000],
    }),
    "lan_unconfirmed",
  );
});
