import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { withTempDb } from "../test/temp-db";
import { enqueue, failActiveJob, hasActiveLifecycleJob } from "./queue";
import { runJob } from "./runner";
import type { JobDeps } from "./types";

function insertFakeProject(
  db: Database.Database,
  opts?: { hostPort?: number; rootPath?: string; composeFile?: string },
): number {
  const now = new Date().toISOString();
  const slug = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rootPath = opts?.rootPath ?? "/tmp/fake";
  const composeFile = opts?.composeFile ?? path.join(rootPath, "docker-compose.yml");
  const result = db
    .prepare(
      `INSERT INTO projects (
        slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'manual', 1, ?, ?)`,
    )
    .run(slug, slug, rootPath, composeFile, slug, now, now);
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

test("start remaps occupied host port and still composeUp", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    let composeCalled = false;
    let seenRemaps: Array<{ service: string; hostPort: number; containerPort: number }> | undefined;
    await runJob(db, q.jobId, {
      async *composeUp(_project, _access, remaps) {
        composeCalled = true;
        seenRemaps = remaps;
      },
      async *composeStop() {},
      async listPorts() {
        return [{ port: 3000, kind: "tcp", owner: "wiremock-gui" }];
      },
    });
    const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(q.jobId) as { status: string };
    const service = db
      .prepare("SELECT host_port FROM project_services WHERE project_id = ?")
      .get(projectId) as { host_port: number };
    const lines = db
      .prepare("SELECT line FROM job_logs WHERE job_id = ?")
      .all(q.jobId) as Array<{ line: string }>;
    assert.equal(job.status, "succeeded");
    assert.equal(service.host_port, 3001);
    assert.equal(composeCalled, true);
    assert.deepEqual(seenRemaps, [{ service: "web", hostPort: 3001, containerPort: 3000 }]);
    assert.ok(lines.some((row) => /3000/.test(row.line) && /3001/.test(row.line) && /wiremock-gui/.test(row.line)));
  } finally {
    close();
  }
});

test("start overlays compose host port when db already stores a remapped port", async () => {
  const { db, close } = withTempDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-compose-"));
  const composeFile = path.join(root, "docker-compose.yml");
  fs.writeFileSync(
    composeFile,
    "services:\n  web:\n    image: nginx\n    ports:\n      - \"3000:80\"\n",
    "utf8",
  );
  try {
    const projectId = insertFakeProject(db, { hostPort: 3001, rootPath: root, composeFile });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    let seenRemaps: Array<{ service: string; hostPort: number; containerPort: number }> | undefined;
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp(_project, _access, remaps) {
          seenRemaps = remaps;
        },
      }),
    );
    const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(q.jobId) as { status: string };
    assert.equal(job.status, "succeeded");
    assert.deepEqual(seenRemaps, [{ service: "web", hostPort: 3001, containerPort: 80 }]);
  } finally {
    close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("start always overlays published ports even when they match compose", async () => {
  const { db, close } = withTempDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-compose-match-"));
  const composeFile = path.join(root, "docker-compose.yml");
  fs.writeFileSync(
    composeFile,
    "services:\n  web:\n    image: nginx\n    ports:\n      - \"3000:80\"\n",
    "utf8",
  );
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000, rootPath: root, composeFile });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    let seenRemaps: Array<{ service: string; hostPort: number; containerPort: number }> | undefined;
    let seenOptions: { publicHost?: string } | undefined;
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp(_project, _access, remaps, options) {
          seenRemaps = remaps;
          seenOptions = options;
        },
      }),
    );
    const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(q.jobId) as { status: string };
    assert.equal(job.status, "succeeded");
    assert.deepEqual(seenRemaps, [{ service: "web", hostPort: 3000, containerPort: 80 }]);
    assert.equal(seenOptions?.publicHost, "127.0.0.1");
  } finally {
    close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lan start passes LAN publicHost into composeUp", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "lan" });
    if (!q.ok) throw new Error("enqueue");
    let seenOptions: { publicHost?: string } | undefined;
    await runJob(
      db,
      q.jobId,
      idleDeps({
        async *composeUp(_project, _access, _remaps, options) {
          seenOptions = options;
        },
        async firewallAllow() {
          return { ok: true };
        },
        async resolvePublicHost(access) {
          assert.equal(access, "lan");
          return "192.168.1.89";
        },
      }),
    );
    const job = db.prepare("SELECT status FROM jobs WHERE id = ?").get(q.jobId) as { status: string };
    assert.equal(job.status, "succeeded");
    assert.equal(seenOptions?.publicHost, "192.168.1.89");
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

test("start fails when a container exits after composeUp", async () => {
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
          yield "Container analytics Started";
        },
        async listContainers() {
          return [{ name: "analytics", running: false, health: "none", binds: [] }];
        },
      }),
    );
    const job = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(q.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(job.status, "failed");
    assert.match(job.error_summary, /analytics/);
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

test("failActiveJob marks queued job failed and ignores succeeded", () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db);
    const queued = enqueue(db, { projectId, type: "start", targetAccess: "lan" });
    if (!queued.ok) throw new Error("enqueue");
    failActiveJob(db, queued.jobId, "runner crashed");
    const failed = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(queued.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(failed.status, "failed");
    assert.equal(failed.error_summary, "runner crashed");

    db.prepare("UPDATE jobs SET status = 'succeeded', error_summary = NULL WHERE id = ?").run(queued.jobId);
    failActiveJob(db, queued.jobId, "should ignore");
    const succeeded = db.prepare("SELECT status FROM jobs WHERE id = ?").get(queued.jobId) as { status: string };
    assert.equal(succeeded.status, "succeeded");
  } finally {
    close();
  }
});
