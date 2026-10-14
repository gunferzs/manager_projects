import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { findPortOwner, type PortInspect } from "../jobs/ports";
import {
  getProjectBySlug,
  insertDraftServices,
  listProjectServices,
  normalizeComposeFile,
  syncComposeServices,
  updateProjectComposeFile,
  updateServiceHostPort,
} from "./repo";
import { parseComposeServices } from "./scan";
import type { ProjectServiceRow } from "./types";

export function pickPrimaryService(services: ProjectServiceRow[]): ProjectServiceRow | null {
  const primary = services.find((s) => s.is_primary === 1);
  if (primary) return primary;
  const ui = services.find((s) => s.is_ui === 1 && s.host_port != null);
  if (ui) return ui;
  return services.find((s) => s.host_port != null) ?? null;
}

export function parseHostPortInput(raw: string): { ok: true; port: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: "Порт должен быть числом" };
  const port = Number(trimmed);
  if (port < 1024 || port > 65535) {
    return { ok: false, message: "Порт должен быть в диапазоне 1024–65535" };
  }
  return { ok: true, port };
}

export function isComposePathAllowed(
  rootPath: string,
  currentCompose: string | null,
  nextCompose: string,
): boolean {
  const next = path.resolve(nextCompose);
  const root = path.resolve(rootPath);
  const rel = path.relative(root, next);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  if (currentCompose && normalizeComposeFile(currentCompose) === normalizeComposeFile(next)) return true;
  return false;
}

export function checkHostPortFree(
  port: number,
  inspect: PortInspect[],
): { free: true } | { free: false; owner: string } {
  const owner = findPortOwner(port, inspect);
  if (!owner) return { free: true };
  return { free: false, owner };
}

export function saveProjectCompose(
  db: Database.Database,
  slug: string,
  composeFile: string,
): { ok: true } | { ok: false; message: string } {
  const project = getProjectBySlug(db, slug);
  if (!project) return { ok: false, message: "Проект не найден" };
  const next = path.resolve(composeFile);
  if (!isComposePathAllowed(project.root_path, project.compose_file, next)) {
    return { ok: false, message: "Файл вне каталога проекта" };
  }
  if (!fs.existsSync(next)) return { ok: false, message: "Файл не найден" };
  updateProjectComposeFile(db, project.id, next);
  const yamlText = fs.readFileSync(next, "utf8");
  const parsed = parseComposeServices(yamlText);
  if (listProjectServices(db, project.id).length === 0) {
    insertDraftServices(db, project.id, parsed);
  } else {
    syncComposeServices(db, project.id, parsed);
  }
  return { ok: true };
}

export function savePrimaryPort(
  db: Database.Database,
  slug: string,
  port: number,
): { ok: true } | { ok: false; message: string } {
  const project = getProjectBySlug(db, slug);
  if (!project) return { ok: false, message: "Проект не найден" };
  const service = pickPrimaryService(listProjectServices(db, project.id));
  if (!service) return { ok: false, message: "Нет сервиса для основного порта" };
  updateServiceHostPort(db, service.id, port);
  return { ok: true };
}
