# Project Runtime Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На деталке проекта показать и дать править compose-файл (select кандидатов) и основной host-порт с проверкой «свободен ли порт на машине».

**Architecture:** Domain helpers в `src/lib/projects/` (кандидаты compose, выбор primary-сервиса, save + resync). Проверка порта переиспользует `listListeningPorts` / `findPortOwner` из `src/lib/jobs/ports.ts`. Server actions в `src/app/actions/projects.ts`. UI — feature-компонент `RuntimeSettingsForm` на `ProjectDetailScreen` над `ServiceTable`. Схема БД не меняется.

**Tech Stack:** Next.js 14.2.5, React 18, TypeScript 5.4.5, better-sqlite3, js-yaml, Node test runner via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-23-project-runtime-settings-design.md`

## Global Constraints

- Нет миграции схемы: только `projects.compose_file` / `root_path` и `project_services.host_port` / `is_primary` / `is_ui`.
- Compose: select кандидатов в `root_path` (не recursive); текущий `compose_file` всегда в списке, даже если имя «странное».
- После смены compose: `parseComposeServices` + `syncComposeServices` / `insertDraftServices` — **не** затирать уже заданный `host_port`.
- Основной порт: сервис `is_primary = 1`; иначе первый `is_ui = 1` с портом; иначе первый с non-null port.
- «Проверить» = свободен ли TCP на машине (`findPortOwner`), не health-проба таблицы.
- Валидация порта при save: целое `1024…65535`.
- Path traversal: новый compose должен резолвиться под `root_path` **или** совпадать с уже сохранённым абсолютным `compose_file`.
- Страница `page.tsx` — только композиция; вёрстка в components/screens.
- UI-копирайт на русском; идентификаторы — английский.
- Тесты: `*.test.ts` рядом; `npx tsx --test <files>`.
- Коммиты: только если пользователь в этой сессии явно просит commit. Шаги Commit в задачах — для исполнителя плана, не выполнять без этой просьбы.

## File map

```
Create:
  src/lib/projects/compose-candidates.ts
  src/lib/projects/compose-candidates.test.ts
  src/lib/projects/runtime-settings.ts
  src/lib/projects/runtime-settings.test.ts
  src/components/projects/RuntimeSettingsForm.tsx

Modify:
  src/lib/projects/present.ts          # RuntimeSettingsView на DetailPageData
  src/lib/projects/present.test.ts     # pickPrimaryService / model fields if needed
  src/app/actions/projects.ts          # save compose, save port, check port
  src/screens/ProjectDetailScreen.tsx  # mount RuntimeSettingsForm
  src/app/globals.css                  # compact form styles if missing
```

---

### Task 1: Compose candidates listing

**Files:**
- Create: `src/lib/projects/compose-candidates.ts`
- Test: `src/lib/projects/compose-candidates.test.ts`

**Interfaces:**
- Consumes: `node:fs`, `node:path`
- Produces:
  - `listComposeCandidates(rootPath: string, currentComposeFile: string | null): string[]`
  - Returns absolute paths, deduped, stable sort. Includes `currentComposeFile` when non-empty even if missing from disk or outside globs.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projects/compose-candidates.test.ts`  
Expected: FAIL (module / export missing)

- [ ] **Step 3: Write minimal implementation**

```ts
import fs from "node:fs";
import path from "node:path";

const COMPOSE_NAME =
  /^(docker-compose.*\.(ya?ml)|compose.*\.(ya?ml))$/i;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/projects/compose-candidates.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/lib/projects/compose-candidates.ts src/lib/projects/compose-candidates.test.ts
git commit -m "feat: list compose file candidates under project root"
```

---

### Task 2: Runtime settings domain (primary pick, validate, save)

**Files:**
- Create: `src/lib/projects/runtime-settings.ts`
- Test: `src/lib/projects/runtime-settings.test.ts`
- Modify: `src/lib/projects/repo.ts` — add `updateProjectComposeFile(db, projectId, composeFile)` if not present

**Interfaces:**
- Consumes: `getProjectBySlug`, `listProjectServices`, `updateServiceHostPort`, `syncComposeServices`, `insertDraftServices`, `parseComposeServices`, `listComposeCandidates`, `normalizeComposeFile`
- Produces:
  - `pickPrimaryService(services: ProjectServiceRow[]): ProjectServiceRow | null`
  - `parseHostPortInput(raw: string): { ok: true; port: number } | { ok: false; message: string }`
  - `isComposePathAllowed(rootPath: string, currentCompose: string | null, nextCompose: string): boolean`
  - `saveProjectCompose(db, slug, composeFile): { ok: true } | { ok: false; message: string }`
  - `savePrimaryPort(db, slug, port: number): { ok: true } | { ok: false; message: string }`
  - `checkHostPortFree(port: number, inspect: PortInspect[]): { free: true } | { free: false; owner: string }`

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withTempDb } from "../test/temp-db";
import {
  checkHostPortFree,
  isComposePathAllowed,
  parseHostPortInput,
  pickPrimaryService,
  savePrimaryPort,
  saveProjectCompose,
} from "./runtime-settings";

test("pickPrimaryService prefers is_primary then is_ui with port", () => {
  const primary = pickPrimaryService([
    { id: 1, project_id: 1, name: "db", container_name: null, host_port: 5432, health_kind: "tcp", health_path: null, is_primary: 0, is_ui: 0 },
    { id: 2, project_id: 1, name: "web", container_name: null, host_port: 3000, health_kind: "http", health_path: "/", is_primary: 0, is_ui: 1 },
    { id: 3, project_id: 1, name: "api", container_name: null, host_port: 8080, health_kind: "http", health_path: "/", is_primary: 1, is_ui: 0 },
  ]);
  assert.equal(primary?.name, "api");
});

test("parseHostPortInput accepts 1024..65535 only", () => {
  assert.deepEqual(parseHostPortInput("3000"), { ok: true, port: 3000 });
  assert.equal(parseHostPortInput("80").ok, false);
  assert.equal(parseHostPortInput("abc").ok, false);
});

test("isComposePathAllowed rejects traversal outside root", () => {
  const root = "C:\\\\proj\\\\app";
  assert.equal(isComposePathAllowed(root, null, "C:\\\\proj\\\\app\\\\docker-compose.yml"), true);
  assert.equal(isComposePathAllowed(root, null, "C:\\\\other\\\\docker-compose.yml"), false);
  assert.equal(
    isComposePathAllowed(root, "C:\\\\other\\\\legacy.yml", "C:\\\\other\\\\legacy.yml"),
    true,
  );
});

test("checkHostPortFree uses findPortOwner semantics", () => {
  assert.deepEqual(checkHostPortFree(3100, []), { free: true });
  assert.deepEqual(checkHostPortFree(3000, [{ port: 3000, kind: "tcp", owner: "node" }]), {
    free: false,
    owner: "node",
  });
});

test("saveProjectCompose syncs services without wiping remapped host_port", () => {
  const { db, close } = withTempDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgr-rt-compose-"));
  try {
    const a = path.join(dir, "docker-compose.yml");
    const b = path.join(dir, "compose.alt.yml");
    fs.writeFileSync(
      a,
      `services:\n  api:\n    ports: ["3000:3000"]\n`,
    );
    fs.writeFileSync(
      b,
      `services:\n  api:\n    ports: ["3000:3000"]\n  worker:\n    image: x\n`,
    );
    const now = new Date().toISOString();
    const ins = db
      .prepare(
        `INSERT INTO projects (slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at)
         VALUES ('demo', 'demo', NULL, NULL, ?, ?, 'demo', 'discovered', 1, ?, ?)`,
      )
      .run(dir, a, now, now);
    const projectId = Number(ins.lastInsertRowid);
    db.prepare(
      `INSERT INTO project_services (project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui)
       VALUES (?, 'api', NULL, 3001, 'http', '/', 1, 0)`,
    ).run(projectId);

    const result = saveProjectCompose(db, "demo", b);
    assert.equal(result.ok, true);
    const api = db
      .prepare("SELECT host_port FROM project_services WHERE project_id = ? AND name = 'api'")
      .get(projectId) as { host_port: number };
    assert.equal(api.host_port, 3001);
    const worker = db
      .prepare("SELECT name FROM project_services WHERE project_id = ? AND name = 'worker'")
      .get(projectId);
    assert.ok(worker);
    const row = db.prepare("SELECT compose_file FROM projects WHERE id = ?").get(projectId) as {
      compose_file: string;
    };
    assert.equal(path.normalize(row.compose_file), path.normalize(b));
  } finally {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("savePrimaryPort updates primary service port", () => {
  const { db, close } = withTempDb();
  try {
    const now = new Date().toISOString();
    const ins = db
      .prepare(
        `INSERT INTO projects (slug, name, description, image_path, root_path, compose_file, compose_project, source, enabled, created_at, updated_at)
         VALUES ('p', 'p', NULL, NULL, 'C:/x', 'C:/x/docker-compose.yml', 'p', 'discovered', 1, ?, ?)`,
      )
      .run(now, now);
    const projectId = Number(ins.lastInsertRowid);
    db.prepare(
      `INSERT INTO project_services (project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui)
       VALUES (?, 'api', NULL, 3000, 'http', '/', 1, 0)`,
    ).run(projectId);
    assert.equal(savePrimaryPort(db, "p", 3010).ok, true);
    const row = db.prepare("SELECT host_port FROM project_services WHERE project_id = ?").get(projectId) as {
      host_port: number;
    };
    assert.equal(row.host_port, 3010);
  } finally {
    close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projects/runtime-settings.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `repo.ts` add:

```ts
export function updateProjectComposeFile(db: Database.Database, projectId: number, composeFile: string): void {
  db.prepare("UPDATE projects SET compose_file = ?, updated_at = ? WHERE id = ?").run(
    composeFile,
    new Date().toISOString(),
    projectId,
  );
}
```

In `runtime-settings.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { findPortOwner, type PortInspect } from "../jobs/ports";
import {
  getProjectBySlug,
  insertDraftServices,
  listProjectServices,
  normalizeComposeFile,
  syncComposeServices,
  updateProjectComposeFile,
  updateServiceHostPort,
} from "./repo";
import { parseComposeServices } from "./scan";
import type { ProjectServiceRow } from "./types";

export function pickPrimaryService(services: ProjectServiceRow[]): ProjectServiceRow | null {
  const primary = services.find((s) => s.is_primary === 1);
  if (primary) return primary;
  const ui = services.find((s) => s.is_ui === 1 && s.host_port != null);
  if (ui) return ui;
  return services.find((s) => s.host_port != null) ?? null;
}

export function parseHostPortInput(raw: string): { ok: true; port: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: "Порт должен быть числом" };
  const port = Number(trimmed);
  if (port < 1024 || port > 65535) return { ok: false, message: "Порт должен быть в диапазоне 1024–65535" };
  return { ok: true, port };
}

export function isComposePathAllowed(
  rootPath: string,
  currentCompose: string | null,
  nextCompose: string,
): boolean {
  const next = path.resolve(nextCompose);
  const root = path.resolve(rootPath);
  const rel = path.relative(root, next);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  if (currentCompose && normalizeComposeFile(currentCompose) === normalizeComposeFile(next)) return true;
  return false;
}

export function checkHostPortFree(
  port: number,
  inspect: PortInspect[],
): { free: true } | { free: false; owner: string } {
  const owner = findPortOwner(port, inspect);
  if (!owner) return { free: true };
  return { free: false, owner };
}

export function saveProjectCompose(
  db: Database.Database,
  slug: string,
  composeFile: string,
): { ok: true } | { ok: false; message: string } {
  const project = getProjectBySlug(db, slug);
  if (!project) return { ok: false, message: "Проект не найден" };
  const next = path.resolve(composeFile);
  if (!isComposePathAllowed(project.root_path, project.compose_file, next)) {
    return { ok: false, message: "Файл вне каталога проекта" };
  }
  if (!fs.existsSync(next)) return { ok: false, message: "Файл не найден" };
  updateProjectComposeFile(db, project.id, next);
  const yamlText = fs.readFileSync(next, "utf8");
  const parsed = parseComposeServices(yamlText);
  if (listProjectServices(db, project.id).length === 0) {
    insertDraftServices(db, project.id, parsed);
  } else {
    syncComposeServices(db, project.id, parsed);
  }
  return { ok: true };
}

export function savePrimaryPort(
  db: Database.Database,
  slug: string,
  port: number,
): { ok: true } | { ok: false; message: string } {
  const project = getProjectBySlug(db, slug);
  if (!project) return { ok: false, message: "Проект не найден" };
  const service = pickPrimaryService(listProjectServices(db, project.id));
  if (!service) return { ok: false, message: "Нет сервиса для основного порта" };
  updateServiceHostPort(db, service.id, port);
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/projects/runtime-settings.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/lib/projects/runtime-settings.ts src/lib/projects/runtime-settings.test.ts src/lib/projects/repo.ts
git commit -m "feat: save project compose and primary port settings"
```

---

### Task 3: Present model fields for detail page

**Files:**
- Modify: `src/lib/projects/present.ts`
- Modify: `src/lib/projects/present.test.ts` (add tests for new helper re-exports / model shape if logic lives here; otherwise test `pickPrimaryService` already covered — add one test that documents fallback order already in Task 2 is enough; here extend `ProjectDetailModel`)

**Interfaces:**
- Consumes: `listComposeCandidates`, `pickPrimaryService`
- Produces on `ProjectDetailModel`:
  - `rootPath: string`
  - `composeFile: string | null`
  - `composeCandidates: string[]`
  - `primaryPort: number | null`
  - `primaryServiceName: string | null`

- [ ] **Step 1: Write failing assertion in present.test or a small unit around mapping**

If no pure mapper exists, add:

```ts
// in present.test.ts — or skip if only loadDetailPageData is async/docker-heavy;
// prefer exporting buildRuntimeSettingsFields(row, services) from present.ts for testability.
```

Export:

```ts
export function buildRuntimeSettingsFields(
  row: ProjectRow,
  services: ProjectServiceRow[],
): {
  rootPath: string;
  composeFile: string | null;
  composeCandidates: string[];
  primaryPort: number | null;
  primaryServiceName: string | null;
} {
  const primary = pickPrimaryService(services);
  return {
    rootPath: row.root_path,
    composeFile: row.compose_file,
    composeCandidates: listComposeCandidates(row.root_path, row.compose_file),
    primaryPort: primary?.host_port ?? null,
    primaryServiceName: primary?.name ?? null,
  };
}
```

Test:

```ts
test("buildRuntimeSettingsFields lists candidates and primary", () => {
  // temp dir with docker-compose.yml + ProjectRow mock + services
});
```

- [ ] **Step 2: Run fail → implement → pass**

Wire into `loadDetailPageData` `project: { ...buildRuntimeSettingsFields(row, live.services), ... }`.

- [ ] **Step 3: Commit** (only if user asked)

---

### Task 4: Server actions

**Files:**
- Modify: `src/app/actions/projects.ts`

**Interfaces:**
- Consumes: `requireSessionForAction`, `getRuntimeDb`, `saveProjectCompose`, `savePrimaryPort`, `parseHostPortInput`, `checkHostPortFree`, `listListeningPorts`
- Produces:
  - `saveProjectComposeAction(slug: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`
  - `savePrimaryPortAction(slug: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`
  - `checkHostPortAction(formData: FormData): Promise<{ ok: true; free: true } | { ok: true; free: false; owner: string } | { ok: false; error: string }>`

- [ ] **Step 1: Implement actions** (domain already tested; keep actions thin)

```ts
export async function saveProjectComposeAction(slug: string, formData: FormData) {
  await requireSessionForAction();
  const composeFile = String(formData.get("composeFile") ?? "");
  const result = saveProjectCompose(getRuntimeDb(), slug, composeFile);
  if (!result.ok) return { ok: false as const, error: result.message };
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/");
  return { ok: true as const };
}

export async function savePrimaryPortAction(slug: string, formData: FormData) {
  await requireSessionForAction();
  const parsed = parseHostPortInput(String(formData.get("port") ?? ""));
  if (!parsed.ok) return { ok: false as const, error: parsed.message };
  const result = savePrimaryPort(getRuntimeDb(), slug, parsed.port);
  if (!result.ok) return { ok: false as const, error: result.message };
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/");
  return { ok: true as const };
}

export async function checkHostPortAction(formData: FormData) {
  await requireSessionForAction();
  const parsed = parseHostPortInput(String(formData.get("port") ?? ""));
  if (!parsed.ok) return { ok: false as const, error: parsed.message };
  const inspect = await listListeningPorts();
  const check = checkHostPortFree(parsed.port, inspect);
  if (check.free) return { ok: true as const, free: true as const };
  return { ok: true as const, free: false as const, owner: check.owner };
}
```

- [ ] **Step 2: Manual smoke** — typecheck / run related unit tests still pass

Run: `npx tsx --test src/lib/projects/compose-candidates.test.ts src/lib/projects/runtime-settings.test.ts src/lib/projects/present.test.ts`

- [ ] **Step 3: Commit** (only if user asked)

---

### Task 5: UI — RuntimeSettingsForm + screen wire-up

**Files:**
- Create: `src/components/projects/RuntimeSettingsForm.tsx`
- Modify: `src/screens/ProjectDetailScreen.tsx`
- Modify: `src/app/globals.css` — `.runtime-settings` stack, select/input row

**Interfaces:**
- Consumes: actions from Task 4; props from `ProjectDetailModel` runtime fields
- Produces: client form section «Настройки запуска»

- [ ] **Step 1: Implement component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  checkHostPortAction,
  savePrimaryPortAction,
  saveProjectComposeAction,
} from "../../app/actions/projects";

type Props = {
  slug: string;
  composeFile: string | null;
  composeCandidates: string[];
  primaryPort: number | null;
  primaryServiceName: string | null;
};

export function RuntimeSettingsForm({
  slug,
  composeFile,
  composeCandidates,
  primaryPort,
  primaryServiceName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composeError, setComposeError] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [portCheck, setPortCheck] = useState<string | null>(null);
  const [portValue, setPortValue] = useState(primaryPort != null ? String(primaryPort) : "");

  // sync portValue when props refresh after save
  // useEffect(() => setPortValue(...), [primaryPort]);

  const canSaveCompose = composeCandidates.length > 0;

  return (
    <section className="runtime-settings">
      <h3>Настройки запуска</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await saveProjectComposeAction(slug, fd);
            setComposeError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          });
        }}
      >
        <label>
          Compose-файл
          {canSaveCompose ? (
            <select name="composeFile" defaultValue={composeFile ?? composeCandidates[0]} disabled={pending}>
              {composeCandidates.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          ) : (
            <p>{composeFile ?? "файл не найден"}</p>
          )}
        </label>
        {composeError ? <p className="error">{composeError}</p> : null}
        <button type="submit" disabled={!canSaveCompose || pending}>
          Сохранить compose
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await savePrimaryPortAction(slug, fd);
            setPortError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          });
        }}
      >
        <label>
          Основной порт{primaryServiceName ? ` (${primaryServiceName})` : ""}
          <input
            name="port"
            inputMode="numeric"
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            disabled={pending || primaryServiceName == null}
          />
        </label>
        {portError ? <p className="error">{portError}</p> : null}
        {portCheck ? <p>{portCheck}</p> : null}
        <button type="submit" disabled={pending || primaryServiceName == null}>
          Сохранить порт
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("port", portValue);
            startTransition(async () => {
              const res = await checkHostPortAction(fd);
              if (!res.ok) {
                setPortCheck(null);
                setPortError(res.error);
                return;
              }
              setPortError(null);
              setPortCheck(res.free ? "свободен" : `занят: ${res.owner}`);
            });
          }}
        >
          Проверить
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Mount in `ProjectDetailScreen` above `<ServiceTable />`**

```tsx
<RuntimeSettingsForm
  slug={project.slug}
  composeFile={project.composeFile}
  composeCandidates={project.composeCandidates}
  primaryPort={project.primaryPort}
  primaryServiceName={project.primaryServiceName}
/>
<ServiceTable services={project.services} />
```

- [ ] **Step 3: Add minimal CSS** for `.runtime-settings label { display: grid; gap: 0.35rem; margin-block: 0.75rem; }`

- [ ] **Step 4: Run all related tests**

Run: `npx tsx --test src/lib/projects/*.test.ts`  
Expected: PASS

- [ ] **Step 5: Manual check** — open detail, change compose/port, «Проверить» shows свободен/занят

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add src/components/projects/RuntimeSettingsForm.tsx src/screens/ProjectDetailScreen.tsx src/app/globals.css src/lib/projects/present.ts src/app/actions/projects.ts
git commit -m "feat: editable compose and primary port on project detail"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Compose select from root globs | 1, 5 |
| Current compose always in list | 1 |
| Save compose + resync without wiping ports | 2 |
| Primary port field + save | 2, 5 |
| Check = free/busy via netstat owners | 2, 4, 5 |
| Non-primary read-only table | 5 (unchanged ServiceTable) |
| No schema migration | all |
| Path allowlist / no traversal | 2 |
| Port 1024–65535 | 2 |

## Placeholder / consistency self-review

- No TBD steps; signatures align across tasks (`saveProjectCompose`, `checkHostPortFree`, action return unions).
- `normalizeComposeFile` already exists in `repo.ts`.
- Windows paths in tests use `path.join` / `path.normalize` — prefer that over hard-coded `C:\\` equality where possible; `isComposePathAllowed` test may use `path.resolve` temps on the agent machine if `C:\\` roots are awkward — adjust to `fs.mkdtempSync` roots in implementation if needed.
