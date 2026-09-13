import { spawn } from "node:child_process";
import fs from "node:fs";
import type { ContainerFact } from "../status/aggregate";
import type { ProjectRow } from "../projects/types";
import type { TargetAccess } from "../jobs/types";
import type { ComposeListItem } from "./types";

export async function* composeUp(project: ProjectRow, access: TargetAccess): AsyncIterable<string> {
  const file = requireComposeFile(project);
  const name = project.compose_project ?? project.slug;
  const env = { ...process.env };
  if (access === "machine") {
    if (composeFileUsesPublishAddr(file)) {
      env.COMPOSE_PUBLISH_ADDR = "127.0.0.1";
    } else {
      yield "compose публикует как есть";
    }
  }
  yield* spawnCompose(["compose", "-f", file, "-p", name, "up", "-d", "--build"], {
    cwd: project.root_path,
    env,
  });
}

export async function* composeStop(project: ProjectRow): AsyncIterable<string> {
  const file = requireComposeFile(project);
  const name = project.compose_project ?? project.slug;
  yield* spawnCompose(["compose", "-f", file, "-p", name, "stop"], {
    cwd: project.root_path,
    env: process.env,
  });
}

function requireComposeFile(project: ProjectRow): string {
  if (!project.compose_file) {
    throw new Error("compose_file is missing");
  }
  return project.compose_file;
}

function composeFileUsesPublishAddr(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, "utf8");
  return text.includes("${COMPOSE_PUBLISH_ADDR}") || text.includes("$COMPOSE_PUBLISH_ADDR");
}

export async function composeLs(): Promise<{ ok: true; items: ComposeListItem[] } | { ok: false }> {
  try {
    const { stdout, code } = await spawnCapture(["compose", "ls", "--all", "--format", "json"]);
    if (code !== 0) {
      return { ok: false };
    }
    return { ok: true, items: parseComposeLs(stdout) };
  } catch {
    return { ok: false };
  }
}

export function parseComposeLs(stdout: string): ComposeListItem[] {
  const rows = parseJsonRecords(stdout);
  return rows.map((row) => {
    const name = String(row.Name ?? row.name ?? "");
    const configFiles = String(row.ConfigFiles ?? row.configFiles ?? "");
    const status = String(row.Status ?? row.status ?? "");
    return { name, configFiles, running: /running/i.test(status) };
  });
}

export async function listComposeContainers(project: ProjectRow): Promise<ContainerFact[]> {
  const name = project.compose_project ?? project.slug;
  const args = ["compose"];
  if (project.compose_file) {
    args.push("-f", project.compose_file);
  }
  args.push("-p", name, "ps", "-a", "--format", "json");
  try {
    const { stdout, code } = await spawnCapture(args, { cwd: project.root_path });
    if (code !== 0) {
      return [];
    }
    return parseComposePs(stdout);
  } catch {
    return [];
  }
}

export function parseComposePs(stdout: string): ContainerFact[] {
  return parseJsonRecords(stdout).map((row) => {
    const service = String(row.Service ?? row.service ?? row.Name ?? row.name ?? "");
    const state = String(row.State ?? row.state ?? "");
    const healthRaw = String(row.Health ?? row.health ?? "");
    const health =
      healthRaw === "healthy" ? "healthy" : healthRaw === "unhealthy" ? "unhealthy" : "none";
    const publishers = Array.isArray(row.Publishers) ? row.Publishers : [];
    const binds: Array<{ port: number; address: string }> = [];
    for (const pub of publishers) {
      if (!pub || typeof pub !== "object") continue;
      const item = pub as { URL?: unknown; PublishedPort?: unknown };
      const port = Number(item.PublishedPort);
      if (!Number.isFinite(port) || port <= 0) continue;
      const address = typeof item.URL === "string" && item.URL ? item.URL : "0.0.0.0";
      binds.push({ port, address });
    }
    return {
      name: service,
      running: /^running$/i.test(state),
      health,
      binds,
    };
  });
}

function parseJsonRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const jsonStart = Math.min(
    ...["[", "{"].map((ch) => {
      const index = trimmed.indexOf(ch);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  const payload = Number.isFinite(jsonStart) ? trimmed.slice(jsonStart) : trimmed;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
    }
    if (parsed && typeof parsed === "object") {
      return [parsed as Record<string, unknown>];
    }
  } catch {
    // NDJSON
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const item = line.trim();
    if (!item) continue;
    try {
      const parsed = JSON.parse(item) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rows.push(parsed as Record<string, unknown>);
      }
    } catch {
      // skip warning lines
    }
  }
  return rows;
}

function spawnCapture(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, code });
    });
  });
}

function spawnCompose(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      const child = spawn("docker", args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const pending: string[] = [];
      let leftoverOut = "";
      let leftoverErr = "";
      let finished = false;
      let failure: Error | null = null;
      let notify: (() => void) | null = null;

      const wake = () => {
        notify?.();
        notify = null;
      };

      const pushLines = (chunk: Buffer, leftover: string): string => {
        const combined = leftover + chunk.toString("utf8");
        const parts = combined.split(/\r?\n/);
        const nextLeftover = parts.pop() ?? "";
        for (const line of parts) {
          if (line.length > 0) pending.push(line);
        }
        wake();
        return nextLeftover;
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        leftoverOut = pushLines(chunk, leftoverOut);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        leftoverErr = pushLines(chunk, leftoverErr);
      });
      child.on("error", (err) => {
        failure = err;
        finished = true;
        wake();
      });
      child.on("close", (code) => {
        if (leftoverOut) pending.push(leftoverOut);
        if (leftoverErr) pending.push(leftoverErr);
        if (code && code !== 0) {
          failure = new Error(`exit:${code}`);
        }
        finished = true;
        wake();
      });

      return {
        async next() {
          while (pending.length === 0 && !finished) {
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
          }
          if (pending.length > 0) {
            return { value: pending.shift() as string, done: false };
          }
          if (failure) throw failure;
          return { value: undefined as unknown as string, done: true };
        },
      };
    },
  };
}
