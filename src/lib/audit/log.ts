import type Database from "better-sqlite3";

const SECRET_KEYS = new Set(["key", "totp", "secret", "token"]);

export type AuditOutcome = "ok" | "fail";

export type AuditEventInput = {
  action: string;
  projectId?: number;
  jobId?: number;
  sessionId?: number;
  ip: string;
  outcome: AuditOutcome;
  detail?: Record<string, unknown>;
};

export type AuditEvent = {
  id: number;
  at: string;
  action: string;
  projectId: number | null;
  jobId: number | null;
  sessionId: number | null;
  ip: string;
  outcome: AuditOutcome;
  detail: Record<string, unknown> | null;
};

export function sanitizeAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEYS.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitizeAuditDetail(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function writeAudit(db: Database.Database, event: AuditEventInput): void {
  const detail = event.detail ? JSON.stringify(sanitizeAuditDetail(event.detail)) : null;
  db.prepare(
    `INSERT INTO audit_events (at, action, project_id, job_id, session_id, ip, outcome, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    event.action,
    event.projectId ?? null,
    event.jobId ?? null,
    event.sessionId ?? null,
    event.ip,
    event.outcome,
    detail,
  );
}

export function listAuditEvents(db: Database.Database, limit = 50): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT id, at, action, project_id, job_id, session_id, ip, outcome, detail
       FROM audit_events
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    at: string;
    action: string;
    project_id: number | null;
    job_id: number | null;
    session_id: number | null;
    ip: string;
    outcome: AuditOutcome;
    detail: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    action: row.action,
    projectId: row.project_id,
    jobId: row.job_id,
    sessionId: row.session_id,
    ip: row.ip,
    outcome: row.outcome,
    detail: parseDetail(row.detail),
  }));
}

function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
