import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { applyScan, parseComposeServices } from "./scan";

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
});
