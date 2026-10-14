import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withTempDb } from "../test/temp-db";
import {
  checkHostPortFree,
  isComposePathAllowed,
  parseHostPortInput,
  pickPrimaryService,
  savePrimaryPort,
  saveProjectCompose,
} from "./runtime-settings";
import type { ProjectServiceRow } from "./types";

function service(partial: Partial<ProjectServiceRow> & Pick<ProjectServiceRow, "id" | "name">): ProjectServiceRow {
  return {
    project_id: 1,
    container_name: null,
    host_port: null,
    health_kind: "http",
    health_path: "/",
    is_primary: 0,
    is_ui: 0,
    ...partial,
  };
}

test("pickPrimaryService prefers is_primary then is_ui with port", () => {
  const primary = pickPrimaryService([
    service({ id: 1, name: "db", host_port: 5432, health_kind: "tcp", health_path: null }),
    service({ id: 2, name: "web", host_port: 3000, is_ui: 1 }),
    service({ id: 3, name: "api", host_port: 8080, is_primary: 1 }),
  ]);
  assert.equal(primary?.name, "api");
});

test("parseHostPortInput accepts 1024..65535 only", () => {
  assert.deepEqual(parseHostPortInput("3000"), { ok: true, port: 3000 });
  assert.equal(parseHostPortInput("80").ok, false);
  assert.equal(parseHostPortInput("abc").ok, false);
});

test("isComposePathAllowed rejects traversal outside root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-rt-root-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-rt-other-"));
  try {
    const inside = path.join(root, "docker-compose.yml");
    const outside = path.join(other, "docker-compose.yml");
    const legacy = path.join(other, "legacy.yml");
    assert.equal(isComposePathAllowed(root, null, inside), true);
    assert.equal(isComposePathAllowed(root, null, outside), false);
    assert.equal(isComposePathAllowed(root, legacy, legacy), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("checkHostPortFree uses findPortOwner semantics", () => {
  assert.deepEqual(checkHostPortFree(3100, []), { free: true });
  assert.deepEqual(checkHostPortFree(3000, [{ port: 3000, kind: "tcp", owner: "node" }]), {
    free: false,
    owner: "node",
  });
});

test("saveProjectCompose syncs services without wiping remapped host_port", () => {
  const { db, close } = withTempDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-rt-compose-"));
  try {
    const a = path.join(dir, "docker-compose.yml");
    const b = path.join(dir, "compose.alt.yml");
    fs.writeFileSync(a, `services:\n  api:\n    ports: ["3000:3000"]\n`);
    fs.writeFileSync(b, `services:\n  api:\n    ports: ["3000:3000"]\n  worker:\n    image: x\n`);
    const now = new Date().toISOString();
    const ins = db
      .prepare(
        `INSERT INTO projects (slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at)
         VALUES ('demo', 'demo', NULL, NULL, ?, ?, 'demo', 'discovered', 1, ?, ?)`,
      )
      .run(dir, a, now, now);
    const projectId = Number(ins.lastInsertRowid);
    db.prepare(
      `INSERT INTO project_services (project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui)
       VALUES (?, 'api', NULL, 3001, 'http', '/', 1, 0)`,
    ).run(projectId);

    const result = saveProjectCompose(db, "demo", b);
    assert.equal(result.ok, true);
    const api = db
      .prepare("SELECT host_port FROM project_services WHERE project_id = ? AND name = 'api'")
      .get(projectId) as { host_port: number };
    assert.equal(api.host_port, 3001);
    const worker = db
      .prepare("SELECT name FROM project_services WHERE project_id = ? AND name = 'worker'")
      .get(projectId);
    assert.ok(worker);
    const row = db.prepare("SELECT compose_file FROM projects WHERE id = ?").get(projectId) as {
      compose_file: string;
    };
    assert.equal(path.normalize(row.compose_file), path.normalize(b));
  } finally {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("savePrimaryPort updates primary service port", () => {
  const { db, close } = withTempDb();
  try {
    const now = new Date().toISOString();
    const ins = db
      .prepare(
        `INSERT INTO projects (slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at)
         VALUES ('p', 'p', NULL, NULL, 'C:/x', 'C:/x/docker-compose.yml', 'p', 'discovered', 1, ?, ?)`,
      )
      .run(now, now);
    const projectId = Number(ins.lastInsertRowid);
    db.prepare(
      `INSERT INTO project_services (project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui)
       VALUES (?, 'api', NULL, 3000, 'http', '/', 1, 0)`,
    ).run(projectId);
    assert.equal(savePrimaryPort(db, "p", 3010).ok, true);
    const row = db.prepare("SELECT host_port FROM project_services WHERE project_id = ?").get(projectId) as {
      host_port: number;
    };
    assert.equal(row.host_port, 3010);
  } finally {
    close();
  }
});
