import type Database from "better-sqlite3";
import type { EnqueueInput, EnqueueResult, JobLogStream } from "./types";

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
