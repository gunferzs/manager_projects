import { spawn } from "node:child_process";
import os from "node:os";

export type NetworkProfile = "Public" | "Private" | "Domain" | "unknown";

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip.startsWith("127.");
}

function isApipa(ip: string): boolean {
  return ip.startsWith("169.254.");
}

export function pickLanIpv4(ips: string[]): string | null {
  return ips.find((ip) => !isLoopback(ip) && !isApipa(ip)) ?? null;
}

export function profileFromCategories(categories: string[]): NetworkProfile {
  if (categories.includes("Public")) return "Public";
  if (categories.includes("DomainAuthenticated") || categories.includes("Domain")) return "Domain";
  if (categories.includes("Private")) return "Private";
  return "unknown";
}

function spawnText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `exit:${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function asArray(parsed: unknown): Record<string, unknown>[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) return parsed.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  if (typeof parsed === "object") return [parsed as Record<string, unknown>];
  return [];
}

function firstOsLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family) === "IPv4" || String(addr.family) === "4";
      if (family && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return pickLanIpv4(ips);
}

export async function getLanIpv4(): Promise<string | null> {
  if (process.platform === "win32") {
    try {
      const out = await spawnText("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-NetIPAddress -AddressFamily IPv4 | ConvertTo-Json -Compress",
      ]);
      const rows = asArray(JSON.parse(out));
      const ips = rows
        .map((row) => row.IPAddress)
        .filter((ip): ip is string => typeof ip === "string");
      const picked = pickLanIpv4(ips);
      if (picked) return picked;
    } catch {
      // fallback below
    }
  }
  return firstOsLanIp();
}

export async function getNetworkProfile(): Promise<NetworkProfile> {
  if (process.platform !== "win32") {
    return "unknown";
  }
  try {
    const out = await spawnText("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-NetConnectionProfile | ConvertTo-Json -Compress",
    ]);
    const rows = asArray(JSON.parse(out));
    const categories = rows
      .map((row) => row.NetworkCategory)
      .filter((cat): cat is string => typeof cat === "string");
    return profileFromCategories(categories);
  } catch {
    return "unknown";
  }
}
