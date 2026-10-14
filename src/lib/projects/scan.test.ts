import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withTempDb } from "../test/temp-db";
import { applyScan, parseComposeHostPort, parseComposeServices, parseComposeTargetPort } from "./scan";

test("scan creates from compose ls and does not overwrite manual description", () => {
  const { db, close } = withTempDb();
  try {
    applyScan(db, [
      { name: "volleyball", configFiles: "C:\\\\fake\\\\volleyball\\\\docker-compose.yml", running: true },
    ]);
    db.prepare("UPDATE projects SET description = 'keep me', name = 'Volleyball UI' WHERE compose_project = ?")
      .run("volleyball");
    applyScan(db, [
      { name: "volleyball", configFiles: "C:\\\\fake\\\\volleyball\\\\docker-compose.yml", running: false },
    ]);
    const row = db.prepare("SELECT name, description FROM projects WHERE compose_project = ?").get("volleyball") as {
      name: string;
      description: string;
    };
    assert.equal(row.name, "Volleyball UI");
    assert.equal(row.description, "keep me");
  } finally {
    close();
  }
});

test("rescan adds services that appeared in compose later", () => {
  const { db, close } = withTempDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-scan-"));
  const composeFile = path.join(dir, "docker-compose.yml");
  try {
    fs.writeFileSync(
      composeFile,
      `
services:
  postgres:
    ports:
      - "5434:5432"
`,
      "utf8",
    );
    applyScan(db, [{ name: "employee_team_manager", configFiles: composeFile, running: false }]);
    let services = db
      .prepare("SELECT name, host_port FROM project_services ORDER BY name")
      .all() as Array<{ name: string; host_port: number | null }>;
    assert.deepEqual(
      services.map((s) => s.name),
      ["postgres"],
    );

    fs.writeFileSync(
      composeFile,
      `
services:
  postgres:
    ports:
      - "5434:5432"
  app:
    container_name: employee_team_manager_app
    ports:
      - "\${APP_HOST_PORT:-3000}:3000"
`,
      "utf8",
    );
    applyScan(db, [{ name: "employee_team_manager", configFiles: composeFile, running: false }]);
    services = db
      .prepare("SELECT name, host_port, is_primary, is_ui FROM project_services ORDER BY name")
      .all() as Array<{
      name: string;
      host_port: number | null;
      is_primary: number;
      is_ui: number;
    }>;
    assert.deepEqual(
      services.map((s) => s.name),
      ["app", "postgres"],
    );
    const app = services.find((s) => s.name === "app");
    assert.equal(app?.host_port, 3000);
    assert.equal(app?.is_primary, 1);
    assert.equal(app?.is_ui, 1);
  } finally {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseComposeServices reads host ports", () => {
  const yaml = `
services:
  backend:
    ports:
      - "3001:3001"
  frontend:
    container_name: volleyball_frontend
    ports:
      - published: 3000
        target: 3000
`;
  const services = parseComposeServices(yaml);
  assert.equal(services.find((s) => s.name === "backend")?.hostPort, 3001);
  assert.equal(services.find((s) => s.name === "frontend")?.containerName, "volleyball_frontend");
  assert.equal(services.find((s) => s.name === "frontend")?.hostPort, 3000);
  assert.equal(parseComposeTargetPort('services:\n  web:\n    ports: ["5173:80"]\n', "web"), 80);
  assert.equal(parseComposeHostPort('services:\n  web:\n    ports: ["5173:80"]\n', "web"), 5173);
});

test("parseComposeServices reads interpolated host bind ports", () => {
  const yaml = `
services:
  frontend:
    ports:
      - "\${VOLLEYBALL_PUBLISH_ADDR:-0.0.0.0}:3000:3000"
      - "[::1]:3000:3000"
  backend:
    ports:
      - "\${VOLLEYBALL_PUBLISH_ADDR:-0.0.0.0}:3001:3001"
`;
  const services = parseComposeServices(yaml);
  assert.equal(services.find((s) => s.name === "frontend")?.hostPort, 3000);
  assert.equal(services.find((s) => s.name === "backend")?.hostPort, 3001);
});

test("parseComposeServices reads ${VAR:-port} host defaults", () => {
  const yaml = `
services:
  app:
    ports:
      - "\${APP_HOST_PORT:-3000}:3000"
  postgres:
    ports:
      - "5434:5432"
`;
  const services = parseComposeServices(yaml);
  assert.equal(services.find((s) => s.name === "app")?.hostPort, 3000);
  assert.equal(services.find((s) => s.name === "app")?.containerPort, 3000);
  assert.equal(services.find((s) => s.name === "postgres")?.hostPort, 5434);
  assert.equal(services.find((s) => s.name === "postgres")?.containerPort, 5432);
});
