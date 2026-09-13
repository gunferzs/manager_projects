import type Database from "better-sqlite3";
import { listProjectServices } from "../projects/repo";
import type { ProjectRow } from "../projects/types";
import { findPortOwner } from "./ports";
import { appendLog } from "./queue";
import type { JobDeps, JobRow, TargetAccess } from "./types";

export async function runJob(db: Database.Database, jobId: number, deps: JobDeps): Promise<void> {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRow | undefined;
  if (!job) {
    throw new Error(`job ${jobId} not found`);
  }

  db.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    jobId,
  );

  try {
    if (job.type === "start" || job.type === "restart") {
      await runStartLike(db, job, deps);
      return;
    }
    if (job.type === "stop") {
      await streamCompose(db, jobId, () => deps.composeStop(loadProject(db, job.project_id)));
      succeedJob(db, jobId);
      return;
    }
    succeedJob(db, jobId);
  } catch (err) {
    failJob(db, jobId, err instanceof Error ? err.message : String(err));
  }
}

async function runStartLike(db: Database.Database, job: JobRow, deps: JobDeps): Promise<void> {
  const project = loadProject(db, job.project_id);
  const ports = listProjectServices(db, project.id)
    .map((service) => service.host_port)
    .filter((port): port is number => port != null);

  const inspect = await deps.listPorts();
  for (const port of ports) {
    const owner = findPortOwner(port, inspect);
    if (owner) {
      failJob(db, job.id, `Порт ${port} занят: ${owner}`);
      return;
    }
  }

  const access: TargetAccess = job.target_access === "lan" ? "lan" : "machine";
  if (access === "lan") {
    if (!deps.firewallAllow) {
      failJob(db, job.id, "Помощник фаервола недоступен");
      return;
    }
    const fw = await deps.firewallAllow(ports);
    if (!fw.ok) {
      failJob(db, job.id, fw.message);
      return;
    }
  }

  if (job.type === "restart") {
    await streamCompose(db, job.id, () => deps.composeStop(project));
  }

  await streamCompose(db, job.id, () => deps.composeUp(project, access));
  succeedJob(db, job.id);
}

async function streamCompose(
  db: Database.Database,
  jobId: number,
  getLines: () => AsyncIterable<string>,
): Promise<void> {
  let last = "";
  for await (const line of getLines()) {
    last = line;
    appendLog(db, jobId, "stdout", line);
  }
  const exit = /^exit:(\d+)$/.exec(last);
  if (exit && exit[1] !== "0") {
    throw new Error(last);
  }
}

function loadProject(db: Database.Database, projectId: number): ProjectRow {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project) {
    throw new Error(`project ${projectId} not found`);
  }
  return project;
}

function failJob(db: Database.Database, jobId: number, summary: string): void {
  appendLog(db, jobId, "system", summary);
  db.prepare("UPDATE jobs SET status = 'failed', error_summary = ?, finished_at = ? WHERE id = ?").run(
    summary,
    new Date().toISOString(),
    jobId,
  );
}

function succeedJob(db: Database.Database, jobId: number): void {
  db.prepare("UPDATE jobs SET status = 'succeeded', finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    jobId,
  );
}
