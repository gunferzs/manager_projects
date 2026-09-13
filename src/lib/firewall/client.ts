import { spawn } from "node:child_process";
import path from "node:path";
import type { FwCommand } from "./parse";

export type FirewallResult = { ok: boolean; message?: string; names?: string[] };

function commandToArgv(command: FwCommand): string[] {
  switch (command.action) {
    case "allow":
      return ["allow", "--name", command.name, "--port", String(command.port)];
    case "revoke":
      return ["revoke", "--name", command.name];
    case "list":
      return ["list", "--prefix", command.prefix];
  }
}

function helperScriptPath(): string {
  return path.join(process.cwd(), "helper", "firewall.mjs");
}

export function runFirewall(command: FwCommand): Promise<FirewallResult> {
  return new Promise((resolve) => {
    const script = helperScriptPath();
    const child = spawn(process.execPath, [script, ...commandToArgv(command)], {
      env: { ...process.env, MGR_FW_DRY: process.env.MGR_FW_DRY ?? "1" },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      resolve({ ok: false, message: err.message });
    });

    child.on("close", (code) => {
      if (code === 2) {
        resolve({
          ok: false,
          message: "Нужны права администратора для правила фаервола",
        });
        return;
      }
      if (code !== 0) {
        resolve({ ok: false, message: stderr.trim() || `exit:${code}` });
        return;
      }
      try {
        const payload = JSON.parse(stdout.trim()) as { ok?: boolean; names?: string[] };
        resolve({ ok: payload.ok === true, names: payload.names });
      } catch {
        resolve({ ok: false, message: "Неверный ответ помощника фаервола" });
      }
    });
  });
}
