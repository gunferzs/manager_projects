"use server";

import { requireSessionForAction } from "../../lib/auth/require-action";
import { getRuntimeDb } from "../../lib/db/client";
import { createJobDeps } from "../../lib/jobs/deps";
import {
  enqueue,
  getJob,
  getLastSuccessfulStartAccess,
  listJobLogs,
} from "../../lib/jobs/queue";
import { runJob } from "../../lib/jobs/runner";
import type { JobStatus, TargetAccess } from "../../lib/jobs/types";
import { getProjectBySlug } from "../../lib/projects/repo";

export type JobActionResult = { ok: true; jobId: number } | { ok: false; reason: "busy" | "not_found" };

export type JobSnapshot = {
  id: number;
  status: JobStatus;
  errorSummary: string | null;
  logs: Array<{ seq: number; stream: string; line: string }>;
};

function scheduleJob(jobId: number, slug: string): void {
  const db = getRuntimeDb();
  const project = getProjectBySlug(db, slug);
  if (!project) return;
  void runJob(db, jobId, createJobDeps(project)).catch(() => undefined);
}

async function enqueueLifecycle(
  slug: string,
  type: "start" | "stop" | "restart",
  targetAccess: TargetAccess | null,
): Promise<JobActionResult> {
  await requireSessionForAction();
  const db = getRuntimeDb();
  const project = getProjectBySlug(db, slug);
  if (!project) {
    return { ok: false, reason: "not_found" };
  }
  const queued = enqueue(db, { projectId: project.id, type, targetAccess });
  if (!queued.ok) {
    return { ok: false, reason: "busy" };
  }
  scheduleJob(queued.jobId, slug);
  return { ok: true, jobId: queued.jobId };
}

export async function startJobAction(slug: string, access: TargetAccess): Promise<JobActionResult> {
  return enqueueLifecycle(slug, "start", access);
}

export async function stopJobAction(slug: string): Promise<JobActionResult> {
  return enqueueLifecycle(slug, "stop", null);
}

export async function restartJobAction(slug: string, access?: TargetAccess): Promise<JobActionResult> {
  await requireSessionForAction();
  const db = getRuntimeDb();
  const project = getProjectBySlug(db, slug);
  if (!project) {
    return { ok: false, reason: "not_found" };
  }
  const target = access ?? getLastSuccessfulStartAccess(db, project.id) ?? "machine";
  return enqueueLifecycle(slug, "restart", target);
}

export async function getJobAction(jobId: number): Promise<JobSnapshot | null> {
  await requireSessionForAction();
  const db = getRuntimeDb();
  const job = getJob(db, jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    errorSummary: job.error_summary,
    logs: listJobLogs(db, job.id),
  };
}
