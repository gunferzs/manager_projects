import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { verifySecret } from "../crypto/hash";
import { insertSession } from "./setup";
import {
  CHALLENGE_TTL_MS,
  KEY_LOCK_AFTER,
  KEY_LOCK_MS,
  type SubmitKeyResult,
} from "./types";

type AuthSettingsRow = {
  key_hash: string | null;
  totp_enabled: number;
  failed_attempts: number;
  locked_until: string | null;
};

export async function submitKey(
  db: Database.Database,
  key: string,
  clientIp: string,
  now: Date = new Date(),
): Promise<SubmitKeyResult> {
  const row = db.prepare(
    `SELECT key_hash, totp_enabled, failed_attempts, locked_until
     FROM auth_settings WHERE id = 1`,
  ).get() as AuthSettingsRow | undefined;

  if (!row?.key_hash) {
    return { kind: "invalid" };
  }

  if (row.locked_until) {
    const until = new Date(row.locked_until);
    if (until.getTime() > now.getTime()) {
      return { kind: "locked", until };
    }
  }

  const ok = await verifySecret(key, row.key_hash);
  if (!ok) {
    return recordFailedAttempt(db, row.failed_attempts, now);
  }

  db.prepare(
    `UPDATE auth_settings
     SET failed_attempts = 0, locked_until = NULL, updated_at = ?
     WHERE id = 1`,
  ).run(now.toISOString());

  if (row.totp_enabled === 1) {
    return { kind: "challenge", token: insertChallenge(db, clientIp, now) };
  }

  return { kind: "session", token: insertSession(db, clientIp, now) };
}

function recordFailedAttempt(
  db: Database.Database,
  failedAttempts: number,
  now: Date,
): SubmitKeyResult {
  const next = failedAttempts + 1;
  if (next >= KEY_LOCK_AFTER) {
    const until = new Date(now.getTime() + KEY_LOCK_MS);
    db.prepare(
      `UPDATE auth_settings
       SET failed_attempts = ?, locked_until = ?, updated_at = ?
       WHERE id = 1`,
    ).run(next, until.toISOString(), now.toISOString());
    return { kind: "locked", until };
  }

  db.prepare(
    `UPDATE auth_settings
     SET failed_attempts = ?, updated_at = ?
     WHERE id = 1`,
  ).run(next, now.toISOString());
  return { kind: "invalid" };
}

function insertChallenge(db: Database.Database, clientIp: string, now: Date): string {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = now.toISOString();
  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO auth_challenges (token_hash, client_ip, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)`,
  ).run(tokenHash, clientIp, expires, created);
  return token;
}
