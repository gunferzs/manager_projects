import fs from "node:fs";
import path from "node:path";

const COMPOSE_NAME = /^(docker-compose.*\.(ya?ml)|compose.*\.(ya?ml))$/i;

export function listComposeCandidates(rootPath: string, currentComposeFile: string | null): string[] {
  const out = new Map<string, string>();
  const add = (filePath: string) => {
    const abs = path.resolve(filePath);
    out.set(abs.toLowerCase(), abs);
  };

  if (rootPath && fs.existsSync(rootPath)) {
    for (const name of fs.readdirSync(rootPath)) {
      if (!COMPOSE_NAME.test(name)) continue;
      const full = path.join(rootPath, name);
      if (fs.statSync(full).isFile()) add(full);
    }
  }

  if (currentComposeFile?.trim()) add(currentComposeFile.trim());

  return Array.from(out.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
