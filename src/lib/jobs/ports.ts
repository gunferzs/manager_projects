import type { PortInspect } from "./types";

export type { PortInspect } from "./types";

export function findPortOwner(port: number, inspect: PortInspect[]): string | null {
  return inspect.find((item) => item.port === port && item.kind === "tcp")?.owner ?? null;
}
