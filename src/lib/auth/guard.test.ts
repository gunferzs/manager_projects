import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";
import { confirmTotpEnroll, generateTotpCode } from "./totp";
import { CHALLENGE_TTL_MS, SESSION_TTL_MS } from "./types";
import {
  COOKIE_CHALLENGE,
  COOKIE_CONFIGURED,
  COOKIE_SESSION,
  challengeCookieOptions,
  configuredCookieOptions,
  sessionCookieOptions,
} from "./cookies";
import { CONFIGURED_COOKIE_MAX_AGE_S } from "./types";
import {
  canAccessPath,
  deniedRedirectPath,
  hasKeyConfiguredFromCookie,
  identityFromCookies,
  isPublicPath,
  resolveIdentity,
} from "./guard";

const anon = { kind: "anon" as const };
const challengeId = { kind: "challenge" as const };
const sessionId = { kind: "session" as const, sessionId: 1 };

test("canAccessPath table", () => {
  assert.equal(canAccessPath(anon, "/login", true), true);
  assert.equal(canAccessPath(anon, "/", true), false);
  assert.equal(canAccessPath(anon, "/setup", false), true);
  assert.equal(canAccessPath(anon, "/setup", true), false);
  assert.equal(canAccessPath(anon, "/login/totp", true), false);
  assert.equal(canAccessPath(challengeId, "/login/totp", true), true);
  assert.equal(canAccessPath(challengeId, "/", true), false);
  assert.equal(canAccessPath(challengeId, "/settings", true), false);
  assert.equal(canAccessPath(challengeId, "/login", true), true);
  assert.equal(canAccessPath(sessionId, "/", true), true);
  assert.equal(canAccessPath(sessionId, "/projects/x", true), true);
  assert.equal(canAccessPath(sessionId, "/settings", true), true);
  assert.equal(canAccessPath(sessionId, "/setup", true), false);
});

test("hasKeyConfiguredFromCookie drives access redirects", () => {
  assert.equal(hasKeyConfiguredFromCookie(undefined), false);
  assert.equal(hasKeyConfiguredFromCookie(""), false);
  assert.equal(hasKeyConfiguredFromCookie("1"), true);
  assert.equal(deniedRedirectPath(anon, "/", hasKeyConfiguredFromCookie(undefined)), "/setup");
  assert.equal(deniedRedirectPath(anon, "/", hasKeyConfiguredFromCookie("1")), "/login");
  assert.equal(canAccessPath(anon, "/setup", hasKeyConfiguredFromCookie(undefined)), true);
  assert.equal(canAccessPath(anon, "/setup", hasKeyConfiguredFromCookie("1")), false);
});

test("deniedRedirectPath and cookie identity", () => {
  assert.deepEqual(identityFromCookies({}), { kind: "anon" });
  assert.deepEqual(identityFromCookies({ challenge: "c" }), { kind: "challenge" });
  assert.deepEqual(identityFromCookies({ session: "s", challenge: "c" }), {
    kind: "session",
    sessionId: 0,
  });
  assert.equal(deniedRedirectPath(anon, "/", false), "/setup");
  assert.equal(deniedRedirectPath(anon, "/", true), "/login");
  assert.equal(deniedRedirectPath(anon, "/setup", true), "/login");
  assert.equal(deniedRedirectPath(sessionId, "/setup", true), "/");
  assert.equal(deniedRedirectPath(anon, "/login", true), null);
  assert.equal(deniedRedirectPath(challengeId, "/login/totp", true), null);
  assert.equal(deniedRedirectPath(anon, "/_next/static/chunk.js", true), null);
});

test("isPublicPath whitelist", () => {
  assert.equal(isPublicPath("/login", true), true);
  assert.equal(isPublicPath("/setup", false), true);
  assert.equal(isPublicPath("/setup", true), false);
  assert.equal(isPublicPath("/login/totp", true), false);
  assert.equal(isPublicPath("/_next/static/chunk.js", true), true);
  assert.equal(isPublicPath("/favicon.ico", true), true);
});

test("resolveIdentity prefers valid session over challenge", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = "master-key-32bytes-minimum-ok!!";
  const { db, close } = withTempDb();
  try {
    const setup = await createSetup(db, "sixteen-chars-ok");
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, process.env.MANAGER_MASTER_KEY!, secret, generateTotpCode(secret));
    const ch = await submitKey(db, "sixteen-chars-ok", "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");

    const identity = resolveIdentity(db, { session: setup.token, challenge: ch.token });
    assert.deepEqual(identity, { kind: "session", sessionId: 1 });
  } finally {
    close();
    if (prevMasterKey === undefined) delete process.env.MANAGER_MASTER_KEY;
    else process.env.MANAGER_MASTER_KEY = prevMasterKey;
  }
});

test("resolveIdentity returns challenge when session cookie missing", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = "master-key-32bytes-minimum-ok!!";
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, process.env.MANAGER_MASTER_KEY!, secret, generateTotpCode(secret));
    const ch = await submitKey(db, "sixteen-chars-ok", "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");

    assert.deepEqual(resolveIdentity(db, { challenge: ch.token }), { kind: "challenge" });
  } finally {
    close();
    if (prevMasterKey === undefined) delete process.env.MANAGER_MASTER_KEY;
    else process.env.MANAGER_MASTER_KEY = prevMasterKey;
  }
});

test("resolveIdentity deletes expired session and returns anon", async () => {
  const { db, close } = withTempDb();
  try {
    const now = new Date("2026-09-13T10:00:00Z");
    const setup = await createSetup(db, "sixteen-chars-ok");
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id = 1").run(
      new Date(now.getTime() - 1000).toISOString(),
    );

    assert.deepEqual(resolveIdentity(db, { session: setup.token }, now), { kind: "anon" });
    const left = (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = 1").get() as { n: number }).n;
    assert.equal(left, 0);
  } finally {
    close();
  }
});

test("resolveIdentity deletes expired challenge and returns anon", async () => {
  const prevMasterKey = process.env.MANAGER_MASTER_KEY;
  process.env.MANAGER_MASTER_KEY = "master-key-32bytes-minimum-ok!!";
  const { db, close } = withTempDb();
  try {
    const now = new Date("2026-09-13T10:00:00Z");
    await createSetup(db, "sixteen-chars-ok");
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, process.env.MANAGER_MASTER_KEY!, secret, generateTotpCode(secret));
    const ch = await submitKey(db, "sixteen-chars-ok", "10.0.0.8", now);
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    db.prepare("UPDATE auth_challenges SET expires_at = ?").run(
      new Date(now.getTime() - 1000).toISOString(),
    );

    assert.deepEqual(resolveIdentity(db, { challenge: ch.token }, now), { kind: "anon" });
    const left = (db.prepare("SELECT COUNT(*) AS n FROM auth_challenges").get() as { n: number }).n;
    assert.equal(left, 0);
  } finally {
    close();
    if (prevMasterKey === undefined) delete process.env.MANAGER_MASTER_KEY;
    else process.env.MANAGER_MASTER_KEY = prevMasterKey;
  }
});

test("resolveIdentity returns anon for unknown token", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    assert.deepEqual(resolveIdentity(db, { session: "deadbeef".repeat(8) }), { kind: "anon" });
  } finally {
    close();
  }
});

test("cookie names and options", () => {
  assert.equal(COOKIE_SESSION, "mgr_session");
  assert.equal(COOKIE_CHALLENGE, "mgr_challenge");
  assert.equal(COOKIE_CONFIGURED, "mgr_configured");

  const httpSession = sessionCookieOptions(false);
  assert.equal(httpSession.name, COOKIE_SESSION);
  assert.equal(httpSession.httpOnly, true);
  assert.equal(httpSession.secure, false);
  assert.equal(httpSession.sameSite, "strict");
  assert.equal(httpSession.path, "/");
  assert.equal(httpSession.maxAge, SESSION_TTL_MS / 1000);

  const httpsSession = sessionCookieOptions(true);
  assert.equal(httpsSession.secure, true);

  const httpChallenge = challengeCookieOptions(false);
  assert.equal(httpChallenge.name, COOKIE_CHALLENGE);
  assert.equal(httpChallenge.maxAge, CHALLENGE_TTL_MS / 1000);

  const httpConfigured = configuredCookieOptions(false);
  assert.equal(httpConfigured.name, COOKIE_CONFIGURED);
  assert.equal(httpConfigured.httpOnly, true);
  assert.equal(httpConfigured.secure, false);
  assert.equal(httpConfigured.sameSite, "strict");
  assert.equal(httpConfigured.maxAge, CONFIGURED_COOKIE_MAX_AGE_S);
});
