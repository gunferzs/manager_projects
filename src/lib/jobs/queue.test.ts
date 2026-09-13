import test from "node:test";
import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { withTempDb } from "../test/temp-db";
import { enqueue, hasActiveLifecycleJob } from "./queue";
import { runJob } from "./runner";
import type { JobDeps } from "./types";

function insertFakeProject(db: Database.Database, opts?: { hostPort?: number }): number {
  const now = new Date().toISOString();
  const slug = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = db
    .prepare(
      `INSERT INTO projects (
        slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'manual', 1, ?, ?)`,
    )
    .run(slug, slug, "/tmp/fake", "/tmp/fake/docker-compose.yml", slug, now, now);
  const projectId = Number(result.lastInsertRowid);
  if (opts?.hostPort != null) {
    db.prepare(
      `INSERT INTO project_services (
        project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui
      ) VALUES (?, 'web', NULL, ?, 'http', '/health', 1, 1)`,
    ).run(projectId, opts.hostPort);
  }
  return projectId;
}

function idleDeps(overrides: Partial<JobDeps> = {}): JobDeps {
  return {
    async *composeUp() {},
    async *composeStop() {},
    async listPorts() {
      return [];
    },
    ...overrides,
  };
}

test("second start while running is busy", () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db);
    const first = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(first.ok, true);
    db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(first.ok ? first.jobId : 0);
    const second = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "busy");
  } finally {
    close();
  }
});

test("second start while queued is busy", () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db);
    const first = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(first.ok, true);
    assert.equal(hasActiveLifecycleJob(db, projectId), true);
    const second = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "busy");
    const stop = enqueue(db, { projectId, type: "stop", targetAccess: null });
    assert.equal(stop.ok, false);
    if (!stop.ok) assert.equal(stop.reason, "busy");
  } finally {
    close();
  }
});

test("start fails on port conflict before compose", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    let composeCalled = false;
    await runJob(db, q.jobId, {
      async *composeUp() {
        composeCalled = true;
      },
      async *composeStop() {},
      async listPorts() {
        return [{ port: 3000, kind: "tcp", owner: "wiremock-gui" }];
      },
    });
    const job = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(q.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(job.status, "failed");
    assert.match(job.error_summary, /3000/);
    assert.match(job.error_summary, /wiremock-gui/);
    assert.equal(composeCalled, false);
  } finally {
    close();
  }
});

test("lan start does not composeUp when firewallAllow fails", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "lan" });
    if (!q.ok) throw new Error("enqueue");
    let composeCalled = false;
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp() {
          composeCalled = true;
        },
        async firewallAllow() {
          return { ok: false, message: "Нужны права администратора для правила фаервола" };
        },
      }),
    );
    const job = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(q.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(job.status, "failed");
    assert.match(job.error_summary, /фаервол|администратора/i);
    assert.equal(composeCalled, false);
  } finally {
    close();
  }
});

test("start streams compose output and succeeds", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp() {
          yield "Creating web";
        },
      }),
    );
    const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(q.jobId) as { status: string };
    assert.equal(job.status, "succeeded");
    const lines = db
      .prepare("SELECT line FROM job_logs WHERE job_id = ? ORDER BY seq")
      .all(q.jobId) as Array<{ line: string }>;
    assert.ok(lines.some((row) => row.line === "Creating web"));
  } finally {
    close();
  }
});

test("start fails when composeUp throws and does not leave job running", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db);
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp() {
          throw new Error("compose exited 1");
        },
      }),
    );
    const job = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(q.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(job.status, "failed");
    assert.match(job.error_summary, /compose exited 1/);
  } finally {
    close();
  }
});
