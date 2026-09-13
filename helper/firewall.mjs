import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(helperDir);

await import("tsx/esm");
const parseModuleUrl = pathToFileURL(path.join(projectRoot, "src/lib/firewall/parse.ts")).href;
const { parseFwArgv } = await import(parseModuleUrl);

const parsed = parseFwArgv(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n`);
  process.exit(1);
}

const dryRun = process.env.MGR_FW_DRY === "1";

function runNetsh(args) {
  const result = spawnSync("netsh", args, { encoding: "utf8", windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ...result, output };
}

function isElevationError(output) {
  return /elevated|administrator|администратор|повышен/i.test(output);
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const { command } = parsed;

if (command.action === "allow") {
  if (dryRun) {
    printJson({ ok: true });
    process.exit(0);
  }
  const result = runNetsh([
    "advfirewall",
    "firewall",
    "add",
    "rule",
    `name=${command.name}`,
    "dir=in",
    "action=allow",
    "protocol=TCP",
    `localport=${command.port}`,
    "profile=private,domain",
  ]);
  if (isElevationError(result.output)) {
    process.stderr.write("Нужны права администратора для правила фаервола\n");
    process.exit(2);
  }
  if (result.status !== 0) {
    process.stderr.write(result.output || "netsh allow failed\n");
    process.exit(1);
  }
  printJson({ ok: true });
  process.exit(0);
}

if (command.action === "revoke") {
  if (dryRun) {
    printJson({ ok: true });
    process.exit(0);
  }
  const result = runNetsh(["advfirewall", "firewall", "delete", "rule", `name=${command.name}`]);
  if (isElevationError(result.output)) {
    process.stderr.write("Нужны права администратора для правила фаервола\n");
    process.exit(2);
  }
  if (result.status !== 0) {
    process.stderr.write(result.output || "netsh revoke failed\n");
    process.exit(1);
  }
  printJson({ ok: true });
  process.exit(0);
}

if (command.action === "list") {
  if (dryRun) {
    printJson({ ok: true, names: [] });
    process.exit(0);
  }
  const result = runNetsh(["advfirewall", "firewall", "show", "rule", "name=all"]);
  if (isElevationError(result.output)) {
    process.stderr.write("Нужны права администратора для правила фаервола\n");
    process.exit(2);
  }
  if (result.status !== 0) {
    process.stderr.write(result.output || "netsh list failed\n");
    process.exit(1);
  }
  const names = [];
  for (const line of result.output.split(/\r?\n/)) {
    const match = /^Rule Name:\s*(.+)\s*$/i.exec(line);
    if (match) {
      const name = match[1].trim();
      if (name.startsWith(command.prefix)) {
        names.push(name);
      }
    }
  }
  printJson({ ok: true, names });
  process.exit(0);
}

process.stderr.write("Неизвестная команда\n");
process.exit(1);
