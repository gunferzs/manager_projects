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

export function parseComposeServices(yamlText: string): ParsedComposeService[] {
  const doc = yaml.load(yamlText);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [];
  const services = (doc as { services?: unknown }).services;
  if (!services || typeof services !== "object" || Array.isArray(services)) return [];

  return Object.entries(services as Record<string, unknown>).map(([name, spec]) => {
    const fields = spec && typeof spec === "object" && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {};
    const containerName = typeof fields.container_name === "string" ? fields.container_name : null;
    return { name, hostPort: firstHostPort(fields.ports), containerName };
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

    if (listProjectServices(db, project.id).length === 0 && composeFile && fs.existsSync(composeFile)) {
      const yamlText = fs.readFileSync(composeFile, "utf8");
      insertDraftServices(db, project.id, parseComposeServices(yamlText));
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

function firstHostPort(ports: unknown): number | null {
  if (!Array.isArray(ports) || ports.length === 0) return null;
  return parsePortEntry(ports[0]);
}

function parsePortEntry(entry: unknown): number | null {
  if (typeof entry === "number") return numericPort(entry);
  if (typeof entry === "string") return parseShortPort(entry);
  if (entry && typeof entry === "object") {
    return parsePortValue((entry as { published?: unknown }).published);
  }
  return null;
}

function parseShortPort(spec: string): number | null {
  const trimmed = spec.trim();
  const ipv6 = trimmed.match(/^\[.*?\]:(\S+)/);
  if (ipv6) return parsePortValue(ipv6[1].split(":")[0]);

  const parts = trimmed.split(":");
  if (parts.length === 1) return parsePortValue(parts[0]);
  if (parts.length === 2) return parsePortValue(parts[0]);
  if (parts.length === 3) return parsePortValue(parts[1]);
  return null;
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
