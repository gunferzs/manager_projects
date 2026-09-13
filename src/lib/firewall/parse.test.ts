import test from "node:test";
import assert from "node:assert/strict";
import { parseFwArgv } from "./parse";

test("parse rejects unknown and non-prefixed names", () => {
  assert.equal(parseFwArgv(["boom"]).ok, false);
  assert.equal(parseFwArgv(["allow", "--name", "evil", "--port", "80"]).ok, false);
  assert.deepEqual(parseFwArgv(["allow", "--name", "mgrproj-volley-3000", "--port", "3000"]), {
    ok: true,
    command: { action: "allow", name: "mgrproj-volley-3000", port: 3000 },
  });
});

test("parse rejects invalid ports", () => {
  assert.equal(parseFwArgv(["allow", "--name", "mgrproj-a-1", "--port", "0"]).ok, false);
  assert.equal(parseFwArgv(["allow", "--name", "mgrproj-a-1", "--port", "65536"]).ok, false);
  assert.equal(parseFwArgv(["allow", "--name", "mgrproj-a-1", "--port", "abc"]).ok, false);
});

test("parse rejects extra arguments", () => {
  assert.equal(
    parseFwArgv(["allow", "--name", "mgrproj-a-3000", "--port", "3000", "extra"]).ok,
    false,
  );
});

test("parse accepts revoke with prefixed name", () => {
  assert.deepEqual(parseFwArgv(["revoke", "--name", "mgrproj-volley-3000"]), {
    ok: true,
    command: { action: "revoke", name: "mgrproj-volley-3000" },
  });
});

test("parse accepts list with prefix", () => {
  assert.deepEqual(parseFwArgv(["list", "--prefix", "mgrproj-"]), {
    ok: true,
    command: { action: "list", prefix: "mgrproj-" },
  });
});

test("parse rejects list prefix without mgrproj-", () => {
  assert.equal(parseFwArgv(["list", "--prefix", "evil-"]).ok, false);
});
