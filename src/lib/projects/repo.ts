import path from "node:path";
import type Database from "better-sqlite3";
import type { ParsedComposeService, ProjectRow, ProjectServiceRow } from "./types";

export function listProjects(db: Database.Database): ProjectRow[] {
  return db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all() as ProjectRow[];
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
  let assignedPrimary = false;
  for (const service of services) {
    const hasPort = service.hostPort != null;
    const isPrimary = !assignedPrimary && !isDbService(service.name);
    if (isPrimary) assignedPrimary = true;
    insert.run(
      projectId,
      service.name,
      service.containerName,
      service.hostPort,
      hasPort ? "http" : "none",
      hasPort ? "/health" : null,
      isPrimary ? 1 : 0,
      isUiService(service.name) ? 1 : 0,
    );
  }
}

function isDbService(name: string): boolean {
  return /^(db|database|postgres|postgresql|mysql|mariadb|mongo|mongodb|redis)$/i.test(name);
}

function isUiService(name: string): boolean {
  return /web|frontend|ui/i.test(name);
}
