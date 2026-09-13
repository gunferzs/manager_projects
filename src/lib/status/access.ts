import type { ProjectStatus } from "./aggregate";

export type AccessLevel = "machine" | "lan" | "lan_unconfirmed" | "none";

const LOCALHOST_ADDRESSES = new Set(["127.0.0.1", "::1"]);

function isPublicBind(address: string): boolean {
  return address === "0.0.0.0" || address === "::";
}

export function resolveAccess(input: {
  status: ProjectStatus;
  binds: Array<{ port: number; address: string }>;
  firewallPorts: number[];
}): AccessLevel {
  const { status, binds, firewallPorts } = input;

  if (status === "stopped") {
    return "none";
  }

  if (binds.length === 0 || binds.every((bind) => LOCALHOST_ADDRESSES.has(bind.address))) {
    return "machine";
  }

  const publicPorts = binds
    .filter((bind) => isPublicBind(bind.address))
    .map((bind) => bind.port);

  if (publicPorts.length === 0) {
    return "machine";
  }

  const firewall = new Set(firewallPorts);
  if (publicPorts.every((port) => firewall.has(port))) {
    return "lan";
  }

  return "lan_unconfirmed";
}
