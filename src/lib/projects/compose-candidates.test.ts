import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listComposeCandidates } from "./compose-candidates";

test("listComposeCandidates finds compose globs and keeps current odd file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-compose-cand-"));
  try {
    fs.writeFileSync(path.join(dir, "docker-compose.yml"), "services: {}\n");
    fs.writeFileSync(path.join(dir, "compose.dev.yaml"), "services: {}\n");
    fs.writeFileSync(path.join(dir, "readme.md"), "x\n");
    const odd = path.join(dir, "stack.prod.yml");
    fs.writeFileSync(odd, "services: {}\n");
    const list = listComposeCandidates(dir, odd);
    assert.ok(list.some((p) => p.endsWith("docker-compose.yml")));
    assert.ok(list.some((p) => p.endsWith("compose.dev.yaml")));
    assert.ok(list.some((p) => path.normalize(p) === path.normalize(odd)));
    assert.equal(list.some((p) => p.endsWith("readme.md")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
