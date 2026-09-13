import os from "node:os";
import type Database from "better-sqlite3";

export const SCAN_ROOTS_KEY = "scan_roots";
export const DEFAULT_PROJECTS_ROOT = "C:\\Users\\gunfe\\projects";

export function defaultScanRoots(): string[] {
  return [DEFAULT_PROJECTS_ROOT, os.homedir()];
}

export function getScanRoots(db: Database.Database): string[] {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(SCAN_ROOTS_KEY) as
    | { value: string }
    | undefined;
  if (!row?.value) {
    return defaultScanRoots();
  }
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string") && parsed.length > 0) {
      return parsed;
    }
  } catch {
    return defaultScanRoots();
  }
  return defaultScanRoots();
}

export function setScanRoots(db: Database.Database, roots: string[]): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SCAN_ROOTS_KEY, JSON.stringify(roots));
}
