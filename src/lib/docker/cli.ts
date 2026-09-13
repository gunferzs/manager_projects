import { spawn } from "node:child_process";
import fs from "node:fs";
import type { ProjectRow } from "../projects/types";
import type { TargetAccess } from "../jobs/types";

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
