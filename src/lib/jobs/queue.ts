import type Database from "better-sqlite3";
import type { EnqueueInput, EnqueueResult, JobLogStream, JobRow, TargetAccess } from "./types";

const LIFECYCLE_TYPES = new Set(["start", "stop", "restart"]);

export function hasActiveLifecycleJob(db: Database.Database, projectId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM jobs
       WHERE project_id = ?
         AND status IN ('queued', 'running')
         AND type IN ('start', 'stop', 'restart')
       LIMIT 1`,
    )
    .get(projectId);
  return row != null;
}

export function enqueue(db: Database.Database, input: EnqueueInput): EnqueueResult {
  if (LIFECYCLE_TYPES.has(input.type) && hasActiveLifecycleJob(db, input.projectId)) {
    return { ok: false, reason: "busy" };
  }
  const result = db
    .prepare("INSERT INTO jobs (project_id, type, target_access, status) VALUES (?, ?, ?, 'queued')")
    .run(input.projectId, input.type, input.targetAccess);
  return { ok: true, jobId: Number(result.lastInsertRowid) };
}

export function appendLog(db: Database.Database, jobId: number, stream: JobLogStream, line: string): void {
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM job_logs WHERE job_id = ?")
    .get(jobId) as { max_seq: number };
  db.prepare("INSERT INTO job_logs (job_id, seq, at, stream, line) VALUES (?, ?, ?, ?, ?)").run(
    jobId,
    row.max_seq + 1,
    new Date().toISOString(),
    stream,
    line,
  );
}

export function getJob(db: Database.Database, jobId: number): JobRow | undefined {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRow | undefined;
}

export function listJobLogs(
  db: Database.Database,
  jobId: number,
): Array<{ seq: number; at: string; stream: JobLogStream; line: string }> {
  return db
    .prepare("SELECT seq, at, stream, line FROM job_logs WHERE job_id = ? ORDER BY seq")
    .all(jobId) as Array<{ seq: number; at: string; stream: JobLogStream; line: string }>;
}

export function getLatestJob(db: Database.Database, projectId: number): JobRow | undefined {
  return db
    .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY id DESC LIMIT 1")
    .get(projectId) as JobRow | undefined;
}

export function getLastSuccessfulStartAccess(
  db: Database.Database,
  projectId: number,
): TargetAccess | null {
  const row = db
    .prepare(
      `SELECT target_access FROM jobs
       WHERE project_id = ? AND type = 'start' AND status = 'succeeded' AND target_access IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(projectId) as { target_access: TargetAccess } | undefined;
  return row?.target_access ?? null;
}
