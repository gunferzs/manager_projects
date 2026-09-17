import type Database from "better-sqlite3";
import { writeAudit } from "../audit/log";
import fs from "node:fs";
import { parseComposeHostPort, parseComposeTargetPort } from "../projects/scan";
import { listProjectServices, updateServiceHostPort } from "../projects/repo";
import type { ProjectRow } from "../projects/types";
import { allocateHostPorts, findPortOwner } from "./ports";
import { appendLog } from "./queue";
import type { ComposePortRemap, JobDeps, JobRow, TargetAccess } from "./types";

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
  const services = listProjectServices(db, project.id);
  const desired = services
    .map((service) => service.host_port)
    .filter((port): port is number => port != null);

  const inspect = await deps.listPorts();
  let assigned: Map<number, number>;
  try {
    ({ assigned } = allocateHostPorts(
      desired,
      inspect.map((item) => item.port),
    ));
  } catch (err) {
    failJob(db, job.id, err instanceof Error ? err.message : String(err));
    return;
  }

  const yamlText =
    project.compose_file && fs.existsSync(project.compose_file)
      ? fs.readFileSync(project.compose_file, "utf8")
      : "";
  const remaps: ComposePortRemap[] = [];
  const usedPorts: number[] = [];

  for (const service of services) {
    if (service.host_port == null) continue;
    const next = assigned.get(service.host_port);
    if (next == null) continue;
    usedPorts.push(next);
    if (next !== service.host_port) {
      const owner = findPortOwner(service.host_port, inspect) ?? "процесс";
      appendLog(db, job.id, "system", `Порт ${service.host_port} занят: ${owner}, выбран ${next}`);
      updateServiceHostPort(db, service.id, next);
    }
    const composeHost = yamlText ? parseComposeHostPort(yamlText, service.name) : null;
    const containerPort =
      (yamlText ? parseComposeTargetPort(yamlText, service.name) : null) ?? composeHost ?? service.host_port;
    const publishedFromCompose = composeHost ?? service.host_port;
    if (next !== publishedFromCompose) {
      remaps.push({
        service: service.name,
        hostPort: next,
        containerPort,
      });
    }
  }

  const access: TargetAccess = job.target_access === "lan" ? "lan" : "machine";
  if (access === "lan") {
    if (!deps.firewallAllow) {
      failJob(db, job.id, "Помощник фаервола недоступен");
      return;
    }
    const fw = await deps.firewallAllow(usedPorts);
    if (!fw.ok) {
      failJob(db, job.id, fw.message);
      return;
    }
  }

  if (job.type === "restart") {
    await streamCompose(db, job.id, () => deps.composeStop(project));
  }

  await streamCompose(db, job.id, () => deps.composeUp(project, access, remaps));
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
  writeJobAudit(db, jobId, "fail");
}

function succeedJob(db: Database.Database, jobId: number): void {
  db.prepare("UPDATE jobs SET status = 'succeeded', finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    jobId,
  );
  writeJobAudit(db, jobId, "ok");
}

function writeJobAudit(db: Database.Database, jobId: number, outcome: "ok" | "fail"): void {
  const job = db.prepare("SELECT id, project_id, type FROM jobs WHERE id = ?").get(jobId) as
    | { id: number; project_id: number; type: string }
    | undefined;
  if (!job) return;
  writeAudit(db, {
    action: job.type,
    projectId: job.project_id,
    jobId: job.id,
    ip: "127.0.0.1",
    outcome,
  });
}
