import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { GuardIdentity } from "./access";

export type { GuardIdentity };
export {
  canAccessPath,
  deniedRedirectPath,
  hasKeyConfiguredFromCookie,
  identityFromCookies,
  isPublicPath,
} from "./access";

type SessionRow = {
  id: number;
  expires_at: string;
};

type ChallengeRow = {
  id: number;
  expires_at: string;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resolveIdentity(
  db: Database.Database,
  cookies: { session?: string; challenge?: string },
  now: Date = new Date(),
): GuardIdentity {
  if (cookies.session) {
    const row = db
      .prepare("SELECT id, expires_at FROM sessions WHERE token_hash = ?")
      .get(tokenHash(cookies.session)) as SessionRow | undefined;

    if (row) {
      if (new Date(row.expires_at).getTime() > now.getTime()) {
        return { kind: "session", sessionId: row.id };
      }
      db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
    }
  }

  if (cookies.challenge) {
    const row = db
      .prepare("SELECT id, expires_at FROM auth_challenges WHERE token_hash = ?")
      .get(tokenHash(cookies.challenge)) as ChallengeRow | undefined;

    if (row) {
      if (new Date(row.expires_at).getTime() > now.getTime()) {
        return { kind: "challenge" };
      }
      db.prepare("DELETE FROM auth_challenges WHERE id = ?").run(row.id);
    }
  }

  return { kind: "anon" };
}
