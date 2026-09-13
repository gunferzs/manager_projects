import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { hashSecret } from "../crypto/hash";
import { SESSION_TTL_MS } from "./types";

export function hasKey(db: Database.Database): boolean {
  const row = db.prepare("SELECT key_hash FROM auth_settings WHERE id = 1").get() as
    | { key_hash: string | null }
    | undefined;
  return typeof row?.key_hash === "string" && row.key_hash.length > 0;
}

export async function createSetup(db: Database.Database, key: string): Promise<{ token: string }> {
  if (key.length < 16) {
    throw Object.assign(new Error("KEY_TOO_SHORT"), { code: "KEY_TOO_SHORT" });
  }
  if (hasKey(db)) {
    throw Object.assign(new Error("ALREADY_SETUP"), { code: "ALREADY_SETUP" });
  }

  const keyHash = await hashSecret(key);
  const now = new Date();
  db.prepare(
    `INSERT INTO auth_settings (id, key_hash, totp_enabled, failed_attempts, updated_at)
     VALUES (1, ?, 0, 0, ?)`,
  ).run(keyHash, now.toISOString());

  return { token: insertSession(db, "", now) };
}

export function insertSession(db: Database.Database, ip: string, now: Date): string {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = now.toISOString();
  const expires = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO sessions (token_hash, created_at, expires_at, last_seen_at, ip)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(tokenHash, created, expires, created, ip);
  return token;
}
