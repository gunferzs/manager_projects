import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRuntimeSettingsFields, firewallPortsForSlug, pickOpenTarget, resolveServicePort } from "./present";
import type { ProjectRow, ProjectServiceRow } from "./types";

test("firewallPortsForSlug reads ports for the project slug", () => {
  assert.deepEqual(firewallPortsForSlug(["mgrproj-neuro-3000", "mgrproj-other-80"], "neuro"), [3000]);
});

test("pickOpenTarget prefers ui live bind when host_port is missing", () => {
  const services = [
    { name: "db", host_port: null, is_ui: 0, is_primary: 0 },
    { name: "backend", host_port: null, is_ui: 0, is_primary: 1 },
    { name: "frontend", host_port: null, is_ui: 1, is_primary: 0 },
  ];
  const containers = [
    { name: "backend", running: true, health: "none" as const, binds: [{ port: 3001, address: "0.0.0.0" }] },
    { name: "frontend", running: true, health: "none" as const, binds: [{ port: 3000, address: "0.0.0.0" }] },
  ];
  assert.equal(resolveServicePort(services[2], containers), 3000);
  assert.deepEqual(pickOpenTarget(services, containers), { port: 3000 });
});

test("pickOpenTarget does not open a lone database port", () => {
  assert.equal(
    pickOpenTarget([{ name: "postgres", host_port: 5434, is_ui: 0, is_primary: 0 }], []),
    null,
  );
});

test("buildRuntimeSettingsFields lists candidates and primary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-present-rt-"));
  try {
    const compose = path.join(dir, "docker-compose.yml");
    fs.writeFileSync(compose, "services: {}\n");
    const row = {
      id: 1,
      slug: "demo",
      name: "demo",
      description: null,
      image_path: null,
      root_path: dir,
      compose_file: compose,
      compose_project: "demo",
      source: "discovered",
      enabled: 1,
      created_at: "",
      updated_at: "",
    } satisfies ProjectRow;
    const services = [
      {
        id: 1,
        project_id: 1,
        name: "api",
        container_name: null,
        host_port: 3000,
        health_kind: "http",
        health_path: "/",
        is_primary: 1,
        is_ui: 0,
      },
    ] satisfies ProjectServiceRow[];
    const fields = buildRuntimeSettingsFields(row, services);
    assert.equal(fields.primaryServiceName, "api");
    assert.equal(fields.primaryPort, 3000);
    assert.ok(fields.composeCandidates.some((p) => path.normalize(p) === path.normalize(compose)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
