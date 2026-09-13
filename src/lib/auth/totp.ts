import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { authenticator } from "otplib";
import { writeAudit } from "../audit/log";
import { decryptString, encryptString } from "../crypto/encrypt";
import { insertSession, sessionIdByToken } from "./setup";

export type VerifyTotpResult =
  | { kind: "session"; token: string }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "ip_mismatch" };

export const TOTP_ATTEMPTS_MAX = 5;

export function isTotpEnabled(db: Database.Database): boolean {
  const row = db.prepare("SELECT totp_enabled FROM auth_settings WHERE id = 1").get() as
    | { totp_enabled: number }
    | undefined;
  return row?.totp_enabled === 1;
}

type ChallengeRow = {
  id: number;
  client_ip: string;
  expires_at: string;
  attempts: number;
};

function requireMasterKey(): string {
  const key = process.env.MANAGER_MASTER_KEY;
  if (!key) {
    throw Object.assign(new Error("MASTER_KEY_MISSING"), { code: "MASTER_KEY_MISSING" });
  }
  return key;
}

function totpAt(at: Date) {
  const inst = authenticator.clone();
  inst.options = { epoch: at.getTime() };
  return inst;
}

export function generateTotpCode(secret: string, at?: Date): string {
  return totpAt(at ?? new Date()).generate(secret);
}

export function beginTotpEnroll(
  _db: Database.Database,
  _masterKey: string,
): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri("admin", "manager-projects", secret);
  return { secret, otpauthUrl };
}

export function confirmTotpEnroll(
  db: Database.Database,
  masterKey: string,
  secret: string,
  code: string,
): boolean {
  if (!authenticator.check(code, secret)) {
    return false;
  }

  const encrypted = encryptString(secret, masterKey);
  db.prepare(
    `UPDATE auth_settings
     SET totp_secret_encrypted = ?, totp_enabled = 1, updated_at = ?
     WHERE id = 1`,
  ).run(encrypted, new Date().toISOString());
  db.prepare("DELETE FROM auth_challenges").run();
  return true;
}

export async function verifyTotp(
  db: Database.Database,
  challengeToken: string,
  code: string,
  clientIp: string,
  now: Date = new Date(),
): Promise<VerifyTotpResult> {
  const tokenHash = createHash("sha256").update(challengeToken).digest("hex");
  const challenge = db
    .prepare(
      `SELECT id, client_ip, expires_at, attempts
       FROM auth_challenges WHERE token_hash = ?`,
    )
    .get(tokenHash) as ChallengeRow | undefined;

  if (!challenge || new Date(challenge.expires_at).getTime() <= now.getTime()) {
    if (challenge) {
      db.prepare("DELETE FROM auth_challenges WHERE id = ?").run(challenge.id);
    }
    writeAudit(db, { action: "login_totp", ip: clientIp, outcome: "fail" });
    return { kind: "expired" };
  }

  if (challenge.client_ip !== clientIp) {
    return recordTotpAttempt(db, challenge, "ip_mismatch");
  }

  const settings = db
    .prepare(`SELECT totp_secret_encrypted FROM auth_settings WHERE id = 1`)
    .get() as { totp_secret_encrypted: string | null } | undefined;

  if (!settings?.totp_secret_encrypted) {
    return recordTotpAttempt(db, challenge, "invalid");
  }

  let secret: string;
  try {
    secret = decryptString(settings.totp_secret_encrypted, requireMasterKey());
  } catch {
    return recordTotpAttempt(db, challenge, "invalid");
  }
  if (!totpAt(now).check(code, secret)) {
    return recordTotpAttempt(db, challenge, "invalid");
  }

  db.prepare("DELETE FROM auth_challenges WHERE id = ?").run(challenge.id);
  const token = insertSession(db, clientIp, now);
  writeAudit(db, {
    action: "login_totp",
    sessionId: sessionIdByToken(db, token),
    ip: clientIp,
    outcome: "ok",
  });
  return { kind: "session", token };
}

function recordTotpAttempt(
  db: Database.Database,
  challenge: ChallengeRow,
  kind: "invalid" | "ip_mismatch",
): VerifyTotpResult {
  const next = challenge.attempts + 1;
  if (next >= TOTP_ATTEMPTS_MAX) {
    db.prepare("DELETE FROM auth_challenges WHERE id = ?").run(challenge.id);
  } else {
    db.prepare("UPDATE auth_challenges SET attempts = ? WHERE id = ?").run(next, challenge.id);
  }
  writeAudit(db, { action: "login_totp", ip: challenge.client_ip, outcome: "fail" });
  return { kind };
}
