import { spawn } from "node:child_process";
import type { PortInspect } from "./types";

export type { PortInspect } from "./types";

export function findPortOwner(port: number, inspect: PortInspect[]): string | null {
  return inspect.find((item) => item.port === port && item.kind === "tcp")?.owner ?? null;
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
