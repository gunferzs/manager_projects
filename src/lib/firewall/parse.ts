import { RULE_PREFIX } from "./names";

export type FwCommand =
  | { action: "allow"; name: string; port: number }
  | { action: "revoke"; name: string }
  | { action: "list"; prefix: string };

export type ParseResult =
  | { ok: true; command: FwCommand }
  | { ok: false; message: string };

function isPrefixedName(name: string): boolean {
  return name.startsWith(RULE_PREFIX);
}

function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function parseNamedFlags(args: string[], required: string[]): Record<string, string> | null {
  if (args.length !== required.length * 2) {
    return null;
  }
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!required.includes(flag) || value == null || value.startsWith("--")) {
      return null;
    }
    if (values[flag] != null) {
      return null;
    }
    values[flag] = value;
  }
  for (const flag of required) {
    if (values[flag] == null) {
      return null;
    }
  }
  return values;
}

export function parseFwArgv(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return { ok: false, message: "Не указана команда" };
  }

  const [command, ...rest] = argv;

  if (command === "allow") {
    const flags = parseNamedFlags(rest, ["--name", "--port"]);
    if (!flags) {
      return { ok: false, message: "Неверные аргументы allow" };
    }
    if (!isPrefixedName(flags["--name"])) {
      return { ok: false, message: "Имя правила должно начинаться с mgrproj-" };
    }
    const port = parsePort(flags["--port"]);
    if (port == null) {
      return { ok: false, message: "Неверный порт" };
    }
    return { ok: true, command: { action: "allow", name: flags["--name"], port } };
  }

  if (command === "revoke") {
    const flags = parseNamedFlags(rest, ["--name"]);
    if (!flags) {
      return { ok: false, message: "Неверные аргументы revoke" };
    }
    if (!isPrefixedName(flags["--name"])) {
      return { ok: false, message: "Имя правила должно начинаться с mgrproj-" };
    }
    return { ok: true, command: { action: "revoke", name: flags["--name"] } };
  }

  if (command === "list") {
    const flags = parseNamedFlags(rest, ["--prefix"]);
    if (!flags) {
      return { ok: false, message: "Неверные аргументы list" };
    }
    if (!isPrefixedName(flags["--prefix"])) {
      return { ok: false, message: "Префикс должен начинаться с mgrproj-" };
    }
    return { ok: true, command: { action: "list", prefix: flags["--prefix"] } };
  }

  return { ok: false, message: "Неизвестная команда" };
}
