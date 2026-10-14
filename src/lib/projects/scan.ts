import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import yaml from "js-yaml";
import type { ComposeListItem } from "../docker/types";
import {
  findProjectForScan,
  firstConfigFile,
  insertDiscoveredProject,
  insertDraftServices,
  listProjectServices,
  syncComposeServices,
} from "./repo";
import type { ParsedComposeService } from "./types";

export type { ComposeListItem } from "../docker/types";
export type { ScanPathSettings } from "./types";

export function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

export function parseComposeTargetPort(yamlText: string, serviceName: string): number | null {
  const services = parseComposeServices(yamlText);
  return services.find((service) => service.name === serviceName)?.containerPort ?? null;
}

export function parseComposeHostPort(yamlText: string, serviceName: string): number | null {
  const services = parseComposeServices(yamlText);
  return services.find((service) => service.name === serviceName)?.hostPort ?? null;
}

export function parseComposeServices(yamlText: string): ParsedComposeService[] {
  const doc = yaml.load(yamlText);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [];
  const services = (doc as { services?: unknown }).services;
  if (!services || typeof services !== "object" || Array.isArray(services)) return [];

  return Object.entries(services as Record<string, unknown>).map(([name, spec]) => {
    const fields = spec && typeof spec === "object" && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {};
    const containerName = typeof fields.container_name === "string" ? fields.container_name : null;
    const published = firstPublishedPort(fields.ports);
    return {
      name,
      hostPort: published.hostPort,
      containerPort: published.containerPort,
      containerName,
    };
  });
}

export function applyScan(
  db: Database.Database,
  items: ComposeListItem[],
): { created: string[]; reused: string[] } {
  const created: string[] = [];
  const reused: string[] = [];

  for (const item of items) {
    const composeFile = firstConfigFile(item.configFiles);
    const existing = findProjectForScan(db, item.name, composeFile);
    const project = existing ?? insertDiscoveredProject(db, {
      slug: uniqueSlug(db, slugFromName(item.name)),
      name: item.name,
      rootPath: composeFile ? path.dirname(composeFile) : item.name,
      composeFile,
      composeProject: item.name,
    });

    if (existing) {
      reused.push(item.name);
    } else {
      created.push(item.name);
    }

    if (composeFile && fs.existsSync(composeFile)) {
      const yamlText = fs.readFileSync(composeFile, "utf8");
      const parsed = parseComposeServices(yamlText);
      if (listProjectServices(db, project.id).length === 0) {
        insertDraftServices(db, project.id, parsed);
      } else {
        syncComposeServices(db, project.id, parsed);
      }
    }
  }

  return { created, reused };
}

function uniqueSlug(db: Database.Database, base: string): string {
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 FROM projects WHERE slug = ?").get(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function firstPublishedPort(ports: unknown): { hostPort: number | null; containerPort: number | null } {
  if (!Array.isArray(ports) || ports.length === 0) {
    return { hostPort: null, containerPort: null };
  }
  return parsePortEntry(ports[0]);
}

function parsePortEntry(entry: unknown): { hostPort: number | null; containerPort: number | null } {
  if (typeof entry === "number") {
    const port = numericPort(entry);
    return { hostPort: port, containerPort: port };
  }
  if (typeof entry === "string") return parseShortPort(entry);
  if (entry && typeof entry === "object") {
    const item = entry as { published?: unknown; target?: unknown };
    const hostPort = parsePortValue(item.published);
    const containerPort = parsePortValue(item.target) ?? hostPort;
    return { hostPort, containerPort };
  }
  return { hostPort: null, containerPort: null };
}

function parseShortPort(spec: string): { hostPort: number | null; containerPort: number | null } {
  // `${APP_HOST_PORT:-3000}:3000` → host 3000 (not `0.0.0.0:3000` with a null host).
  const trimmed = spec
    .trim()
    .replace(/\$\{[^}:]*:-(\d+)\}/g, "$1")
    .replace(/\$\{[^}]+\}/g, "0.0.0.0");
  const ipv6 = trimmed.match(/^\[.*?\]:(\S+)$/);
  if (ipv6) {
    const rest = ipv6[1].split(":");
    if (rest.length === 1) {
      const port = parsePortValue(rest[0]);
      return { hostPort: port, containerPort: port };
    }
    return { hostPort: parsePortValue(rest[0]), containerPort: parsePortValue(rest[1]) ?? parsePortValue(rest[0]) };
  }

  const parts = trimmed.split(":");
  if (parts.length === 1) {
    const port = parsePortValue(parts[0]);
    return { hostPort: port, containerPort: port };
  }
  if (parts.length === 2) {
    return { hostPort: parsePortValue(parts[0]), containerPort: parsePortValue(parts[1]) ?? parsePortValue(parts[0]) };
  }
  if (parts.length === 3) {
    return { hostPort: parsePortValue(parts[1]), containerPort: parsePortValue(parts[2]) ?? parsePortValue(parts[1]) };
  }
  return { hostPort: null, containerPort: null };
}

function parsePortValue(value: unknown): number | null {
  if (typeof value === "number") return numericPort(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return numericPort(Number(trimmed));
}

function numericPort(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}
