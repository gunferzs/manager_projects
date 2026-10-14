import type { AccessLevel } from "./access";
import type { ProjectStatus } from "./aggregate";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  running: "работает",
  degraded: "деградировал",
  unhealthy: "нездоров",
  stopped: "не запущен",
};

const ACCESS_LABELS: Record<AccessLevel, string> = {
  machine: "только машина",
  lan: "локалка",
  lan_unconfirmed: "локалка без фаервола",
  none: "",
};

const STATUS_CHIP: Record<ProjectStatus, string> = {
  running: "chip-ok",
  degraded: "chip-warn",
  unhealthy: "chip-bad",
  stopped: "chip-muted",
};

const ACCESS_CHIP: Record<AccessLevel, string> = {
  lan: "chip-ok",
  lan_unconfirmed: "chip-warn",
  machine: "chip-muted",
  none: "chip-muted",
};

export function statusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}

export function accessLabel(level: AccessLevel): string {
  return ACCESS_LABELS[level];
}

export function openUrl(_level: AccessLevel, _lanIp: string | null, port: number): string {
  return localOpenUrl(port);
}

/** Link for opening from this machine (manager UI). Always loopback — LAN hairpin often breaks under VPN. */
export function localOpenUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** URL to open from another device on the LAN (phone / other PC). */
export function shareUrl(level: AccessLevel, lanIp: string | null, port: number): string | null {
  if ((level === "lan" || level === "lan_unconfirmed") && lanIp) {
    return `http://${lanIp}:${port}`;
  }
  return null;
}

export function statusChipClass(status: ProjectStatus): string {
  return STATUS_CHIP[status];
}

export function accessChipClass(level: AccessLevel): string {
  return ACCESS_CHIP[level];
}
