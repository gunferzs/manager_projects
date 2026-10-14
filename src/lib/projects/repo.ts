import path from "node:path";
import type Database from "better-sqlite3";
import type { ParsedComposeService, ProjectRow, ProjectServiceRow } from "./types";

export function listProjects(db: Database.Database): ProjectRow[] {
  return db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all() as ProjectRow[];
}

export function getProjectBySlug(db: Database.Database, slug: string): ProjectRow | undefined {
  return db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
}

export function normalizeComposeFile(filePath: string): string {
  return path.normalize(filePath.trim()).replaceAll("\\", "/").toLowerCase();
}

export function firstConfigFile(configFiles: string): string {
  return configFiles.split(",")[0]?.trim() ?? "";
}

export function findProjectForScan(
  db: Database.Database,
  composeProject: string,
  composeFile: string,
): ProjectRow | undefined {
  const rows = listProjects(db);
  const normalizedFile = composeFile ? normalizeComposeFile(composeFile) : "";
  return rows.find((row) => {
    if (composeProject && row.compose_project === composeProject) return true;
    if (normalizedFile && row.compose_file && normalizeComposeFile(row.compose_file) === normalizedFile) {
      return true;
    }
    return false;
  });
}

export function insertDiscoveredProject(
  db: Database.Database,
  input: { slug: string; name: string; rootPath: string; composeFile: string; composeProject: string },
): ProjectRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO projects (
        slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'discovered', 1, ?, ?)`,
    )
    .run(input.slug, input.name, input.rootPath, input.composeFile, input.composeProject, now, now);
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid) as ProjectRow;
}

export function listProjectServices(db: Database.Database, projectId: number): ProjectServiceRow[] {
  return db.prepare("SELECT * FROM project_services WHERE project_id = ?").all(projectId) as ProjectServiceRow[];
}

export function updateServiceHostPort(db: Database.Database, serviceId: number, hostPort: number): void {
  db.prepare("UPDATE project_services SET host_port = ? WHERE id = ?").run(hostPort, serviceId);
}

export function updateProjectComposeFile(db: Database.Database, projectId: number, composeFile: string): void {
  db.prepare("UPDATE projects SET compose_file = ?, updated_at = ? WHERE id = ?").run(
    composeFile,
    new Date().toISOString(),
    projectId,
  );
}

export function insertDraftServices(
  db: Database.Database,
  projectId: number,
  services: ParsedComposeService[],
): void {
  const insert = db.prepare(
    `INSERT INTO project_services (
      project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const existing = listProjectServices(db, projectId);
  const hasPrimary = existing.some((service) => service.is_primary === 1);
  let assignedPrimary = hasPrimary;
  for (const service of services) {
    const hasPort = service.hostPort != null;
    const dbLike = isDbService(service.name);
    const isPrimary = !assignedPrimary && !dbLike;
    if (isPrimary) assignedPrimary = true;
    insert.run(
      projectId,
      service.name,
      service.containerName,
      service.hostPort,
      dbLike ? "tcp" : hasPort ? "http" : "none",
      dbLike || !hasPort ? null : "/",
      isPrimary ? 1 : 0,
      isUiService(service.name) ? 1 : 0,
    );
  }
}

/** Add services that appeared in compose later; fill null host ports; keep remapped ports. */
export function syncComposeServices(
  db: Database.Database,
  projectId: number,
  services: ParsedComposeService[],
): { added: string[]; filledPorts: string[] } {
  const existing = listProjectServices(db, projectId);
  const byName = new Map(existing.map((service) => [service.name, service]));
  const missing = services.filter((service) => !byName.has(service.name));
  if (missing.length > 0) {
    insertDraftServices(db, projectId, missing);
  }

  const filledPorts: string[] = [];
  for (const service of services) {
    const row = byName.get(service.name);
    if (!row) continue;
    if (row.host_port == null && service.hostPort != null) {
      updateServiceHostPort(db, row.id, service.hostPort);
      filledPorts.push(service.name);
    }
    if (isDbService(service.name) && row.health_kind !== "tcp") {
      db.prepare(
        "UPDATE project_services SET health_kind = 'tcp', health_path = NULL WHERE id = ?",
      ).run(row.id);
    }
  }

  return { added: missing.map((service) => service.name), filledPorts };
}

function isDbService(name: string): boolean {
  return /^(db|database|postgres|postgresql|mysql|mariadb|mongo|mongodb|redis)$/i.test(name);
}

function isUiService(name: string): boolean {
  return /^(app|web|frontend|ui)$/i.test(name) || /web|frontend|ui/i.test(name);
}
