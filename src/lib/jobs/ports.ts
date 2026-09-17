import { spawn } from "node:child_process";
import type { PortInspect } from "./types";

export type { PortInspect } from "./types";

export function findPortOwner(port: number, inspect: PortInspect[]): string | null {
  return inspect.find((item) => item.port === port && item.kind === "tcp")?.owner ?? null;
}

export type PortRemap = { from: number; to: number };

export function allocateHostPorts(
  desired: number[],
  occupied: Iterable<number>,
): { assigned: Map<number, number>; remaps: PortRemap[] } {
  const taken = new Set(occupied);
  const assigned = new Map<number, number>();
  const remaps: PortRemap[] = [];

  for (const port of desired) {
    if (assigned.has(port)) continue;
    const next = nextFreePort(port, taken);
    if (next == null) {
      throw new Error(`Нет свободного порта рядом с ${port}`);
    }
    assigned.set(port, next);
    taken.add(next);
    if (next !== port) remaps.push({ from: port, to: next });
  }

  return { assigned, remaps };
}

function nextFreePort(desired: number, taken: Set<number>): number | null {
  if (desired >= 1024 && desired <= 65535 && !taken.has(desired)) return desired;
  for (let port = Math.max(desired + 1, 1024); port <= 65535; port += 1) {
    if (!taken.has(port)) return port;
  }
  for (let port = 1024; port < desired; port += 1) {
    if (!taken.has(port)) return port;
  }
  return null;
}

export function parseNetstatListening(text: string, namesByPid: Map<string, string> = new Map()): PortInspect[] {
  const found = new Map<number, string>();
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (!match) continue;
    const port = Number(match[1]);
    const pid = match[2];
    if (found.has(port)) continue;
    found.set(port, namesByPid.get(pid) ?? `pid ${pid}`);
  }
  return Array.from(found.entries()).map(([port, owner]) => ({ port, kind: "tcp" as const, owner }));
}

export function parseTasklistCsv(text: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^"([^"]+)","(\d+)"/);
    if (!match) continue;
    names.set(match[2], match[1].replace(/\.exe$/i, ""));
  }
  return names;
}

function spawnText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`exit:${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function listListeningPorts(): Promise<PortInspect[]> {
  try {
    const netstat = await spawnText("netstat", ["-ano", "-p", "tcp"]);
    let names = new Map<string, string>();
    try {
      names = parseTasklistCsv(await spawnText("tasklist", ["/FO", "CSV", "/NH"]));
    } catch {
      names = new Map();
    }
    return parseNetstatListening(netstat, names);
  } catch {
    return [];
  }
}
