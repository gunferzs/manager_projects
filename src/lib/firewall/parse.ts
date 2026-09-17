export type FwCommand =
  | { action: "allow"; name: string; port: number }
  | { action: "revoke"; name: string }
  | { action: "list"; prefix: string };

export type ParseResult =
  | { ok: true; command: FwCommand }
  | { ok: false; message: string };

export { parseFwArgv } from "./parse-argv.mjs";
