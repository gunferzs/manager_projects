import type { ComposePortRemap } from "../jobs/types";

const UI_SERVICE = /^(app|web|frontend|ui)$/i;

export function buildComposePortOverlay(remaps: ComposePortRemap[], publicHost: string): string {
  const lines = ["services:"];
  for (const remap of remaps) {
    lines.push(`  ${remap.service}:`);
    lines.push("    ports: !override");
    lines.push(`      - "${remap.hostPort}:${remap.containerPort}"`);
    if (UI_SERVICE.test(remap.service)) {
      lines.push("    environment:");
      lines.push(`      NEXTAUTH_URL: http://${publicHost}:${remap.hostPort}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
