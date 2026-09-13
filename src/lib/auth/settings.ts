import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { authenticator } from "otplib";
import { listAuditEvents, writeAudit } from "../audit/log";
import { decryptString, encryptString } from "../crypto/encrypt";
import { hashSecret, verifySecret } from "../crypto/hash";
import { getRuntimeDb } from "../db/client";
import { getLanIpv4, getNetworkProfile, type NetworkProfile } from "../network/lan";
import { getScanRoots } from "../projects/paths-settings";
import { INVALID_DATA_MESSAGE } from "./messages";
import { sessionIdByToken } from "./setup";
import { beginTotpEnroll, confirmTotpEnroll, isTotpEnabled } from "./totp";

const PENDING_TOTP_KEY = "pending_totp_secret";
const KEY_TOO_SHORT = "Ключ не короче 16 символов";

export type ChangeKeyInput = {
  oldKey: string;
  newKey: string;
  totpCode?: string;
  masterKey: string;
  keepSessionToken: string;
};

export type ChangeKeyResult = { ok: true } | { ok: false; message: string };

export type TotpEnrollStartResult =
  | { ok: true; secret: string; otpauthUrl: string }
  | { ok: false; message: string };

export type TotpEnrollConfirmResult = { ok: true } | { ok: false; message: string };

export type SettingsPageData = {
  lanIp: string | null;
  totpEnabled: boolean;
  networkProfile: NetworkProfile;
  scanRoots: string[];
  auditEvents: Array<{
    id: number;
    at: string;
    action: string;
    ip: string;
    outcome: "ok" | "fail";
  }>;
};

type AuthRow = {
  key_hash: string | null;
  totp_enabled: number;
  totp_secret_encrypted: string | null;
};

export async function changeKey(db: Database.Database, input: ChangeKeyInput): Promise<ChangeKeyResult> {
  const row = db
    .prepare(`SELECT key_hash, totp_enabled, totp_secret_encrypted FROM auth_settings WHERE id = 1`)
    .get() as AuthRow | undefined;

  if (!row?.key_hash) {
    writeChangeAudit(db, input, "fail");
    return { ok: false, message: INVALID_DATA_MESSAGE };
  }

  if (input.newKey.length < 16) {
    writeChangeAudit(db, input, "fail");
    return { ok: false, message: KEY_TOO_SHORT };
  }

  const oldOk = await verifySecret(input.oldKey, row.key_hash);
  if (!oldOk) {
    writeChangeAudit(db, input, "fail");
    return { ok: false, message: INVALID_DATA_MESSAGE };
  }

  if (row.totp_enabled === 1) {
    if (!input.totpCode || !row.totp_secret_encrypted) {
      writeChangeAudit(db, input, "fail");
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
    let secret: string;
    try {
      secret = decryptString(row.totp_secret_encrypted, input.masterKey);
    } catch {
      writeChangeAudit(db, input, "fail");
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
    if (!authenticator.check(input.totpCode, secret)) {
      writeChangeAudit(db, input, "fail");
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
  }

  const keyHash = await hashSecret(input.newKey);
  db.prepare(`UPDATE auth_settings SET key_hash = ?, updated_at = ? WHERE id = 1`).run(
    keyHash,
    new Date().toISOString(),
  );

  const keepHash = createHash("sha256").update(input.keepSessionToken).digest("hex");
  db.prepare("DELETE FROM sessions WHERE token_hash != ?").run(keepHash);
  writeChangeAudit(db, input, "ok");
  return { ok: true };
}

export function startTotpEnroll(
  db: Database.Database,
  masterKey: string,
  currentCode?: string,
): TotpEnrollStartResult {
  const row = db
    .prepare(`SELECT totp_enabled, totp_secret_encrypted FROM auth_settings WHERE id = 1`)
    .get() as Pick<AuthRow, "totp_enabled" | "totp_secret_encrypted"> | undefined;

  if (row?.totp_enabled === 1) {
    if (!currentCode || !row.totp_secret_encrypted) {
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
    let currentSecret: string;
    try {
      currentSecret = decryptString(row.totp_secret_encrypted, masterKey);
    } catch {
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
    if (!authenticator.check(currentCode, currentSecret)) {
      return { ok: false, message: INVALID_DATA_MESSAGE };
    }
    db.prepare("DELETE FROM auth_challenges").run();
  }

  const enroll = beginTotpEnroll(db, masterKey);
  upsertSetting(db, PENDING_TOTP_KEY, encryptString(enroll.secret, masterKey));
  return { ok: true, secret: enroll.secret, otpauthUrl: enroll.otpauthUrl };
}

export function confirmPendingTotp(
  db: Database.Database,
  masterKey: string,
  code: string,
  ip: string,
  sessionId?: number,
): TotpEnrollConfirmResult {
  const pending = getSetting(db, PENDING_TOTP_KEY);
  if (!pending) {
    writeAudit(db, { action: "totp_enable", sessionId, ip, outcome: "fail" });
    return { ok: false, message: INVALID_DATA_MESSAGE };
  }

  let secret: string;
  try {
    secret = decryptString(pending, masterKey);
  } catch {
    writeAudit(db, { action: "totp_enable", sessionId, ip, outcome: "fail" });
    return { ok: false, message: INVALID_DATA_MESSAGE };
  }

  if (!confirmTotpEnroll(db, masterKey, secret, code)) {
    writeAudit(db, { action: "totp_enable", sessionId, ip, outcome: "fail" });
    return { ok: false, message: INVALID_DATA_MESSAGE };
  }

  db.prepare("DELETE FROM app_settings WHERE key = ?").run(PENDING_TOTP_KEY);
  writeAudit(db, { action: "totp_enable", sessionId, ip, outcome: "ok" });
  return { ok: true };
}

export async function loadSettingsPageData(): Promise<SettingsPageData> {
  const db = getRuntimeDb();
  const [lanIp, networkProfile] = await Promise.all([getLanIpv4(), getNetworkProfile()]);
  return {
    lanIp,
    totpEnabled: isTotpEnabled(db),
    networkProfile,
    scanRoots: getScanRoots(db),
    auditEvents: listAuditEvents(db).map((event) => ({
      id: event.id,
      at: event.at,
      action: event.action,
      ip: event.ip,
      outcome: event.outcome,
    })),
  };
}

function writeChangeAudit(db: Database.Database, input: ChangeKeyInput, outcome: "ok" | "fail"): void {
  writeAudit(db, {
    action: "change_key",
    sessionId: sessionIdByToken(db, input.keepSessionToken),
    ip: "",
    outcome,
  });
}

function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

function upsertSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
