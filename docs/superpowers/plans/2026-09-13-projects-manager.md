# Projects Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальный веб-менеджер проектов: ключ + TOTP, список со статусами, старт/стоп Docker Compose, запуск в машину или локалку с правилами фаервола.

**Architecture:** Один процесс Next.js 14 (App Router) на `127.0.0.1:3100` за Caddy. Состояние описания — SQLite, живой статус — Docker + каскад проб. Операции — очередь задач. Фаервол — отдельный помощник с белым списком. Страницы только композируют экраны из `src/screens`.

**Tech Stack:** Next.js 14.2.5, React 18, TypeScript 5, better-sqlite3, argon2, otplib, js-yaml, Node.js test runner через `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-13-projects-manager-design.md`

## Global Constraints

- Этап 1: только эта машина. Таблиц `servers` / `deployments` нет.
- Next.js слушает `127.0.0.1:3100`. TLS и 443 — у Caddy, не у Next.
- Хеш ключа: argon2id. TOTP-секрет шифруется `MANAGER_MASTER_KEY`. Ключ логина ≠ master key.
- Cookie: `mgr_session` и `mgr_challenge`, `HttpOnly`, `SameSite=Strict`, `Secure` только на HTTPS.
- `challenge` не даёт доступа ни к чему, кроме `GET /login/totp` и `POST` проверки TOTP. Привязан к IP.
- Challenge TTL: 5 минут. 5 неверных TOTP — challenge сжигается. 8 неверных ключей — lock 15 минут.
- Ключ при setup: минимум 16 символов.
- Ошибки входа: одна фраза «Неверные данные». Блокировка: «Попробуйте через N минут».
- Статус и доступность не хранятся в SQLite.
- Именованные операции только: `start`, `stop`, `restart`, `scan`, firewall `allow`/`revoke`/`list`.
- Правила фаервола: префикс `mgrproj-` + slug + порт. Чужие правила не трогать.
- `compose down` без `-v`. Тома не удалять.
- Чужие репозитории не менять. LAN-IP в их `NEXT_PUBLIC_*` не подставлять.
- Тесты: `*.test.ts` рядом с кодом. Docker в CI мокается. `netsh` в CI не вызывать.
- UI: файл `page.tsx` — только импорты, раскладка, привязка данных. Вёрстка в `src/screens` и `src/components`.
- Корень навигации: список `/`. Новые экраны только из этого флоу.
- Язык UI и сообщений об ошибках — русский. Имена в коде — английский.
- Коммиты: только если пользователь в этой сессии явно просит commit. Шаги Commit в задачах — для исполнителя плана, не выполнять без этой просьбы.

## File map

```
package.json
tsconfig.json
next.config.mjs
.env.example
Caddyfile
.gitignore
src/middleware.ts
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/setup/page.tsx
src/app/login/page.tsx
src/app/login/totp/page.tsx
src/app/projects/[slug]/page.tsx
src/app/settings/page.tsx
src/app/actions/auth.ts
src/app/actions/projects.ts
src/app/actions/jobs.ts
src/app/actions/settings.ts
src/screens/SetupScreen.tsx
src/screens/LoginScreen.tsx
src/screens/TotpScreen.tsx
src/screens/ProjectListScreen.tsx
src/screens/ProjectDetailScreen.tsx
src/screens/SettingsScreen.tsx
src/components/layout/AppHeader.tsx
src/components/layout/TotpBanner.tsx
src/components/auth/KeyForm.tsx
src/components/auth/TotpForm.tsx
src/components/projects/ProjectCard.tsx
src/components/projects/StatusChip.tsx
src/components/projects/AccessChip.tsx
src/components/projects/StartDialog.tsx
src/components/projects/ServiceTable.tsx
src/components/jobs/JobLog.tsx
src/lib/db/client.ts
src/lib/db/schema.ts
src/lib/db/paths.ts
src/lib/crypto/hash.ts
src/lib/crypto/encrypt.ts
src/lib/auth/types.ts
src/lib/auth/client-ip.ts
src/lib/auth/cookies.ts
src/lib/auth/setup.ts
src/lib/auth/login.ts
src/lib/auth/totp.ts
src/lib/auth/guard.ts
src/lib/auth/settings.ts
src/lib/projects/types.ts
src/lib/projects/repo.ts
src/lib/projects/scan.ts
src/lib/docker/types.ts
src/lib/docker/cli.ts
src/lib/status/aggregate.ts
src/lib/status/access.ts
src/lib/status/probes.ts
src/lib/jobs/types.ts
src/lib/jobs/queue.ts
src/lib/jobs/runner.ts
src/lib/jobs/ports.ts
src/lib/firewall/names.ts
src/lib/firewall/client.ts
src/lib/firewall/parse.ts
src/lib/network/lan.ts
src/lib/audit/log.ts
src/lib/test/temp-db.ts
helper/firewall.mjs
```

---

### Task 1: Каркас, SQLite, схема

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/client.test.ts`
- Create: `src/lib/test/temp-db.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `openDb(dbPath: string): Database` (better-sqlite3), `migrate(db: Database): void`, `withTempDb(): { db: Database; dbPath: string; close(): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/client.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";

test("migrate creates auth_settings and rejects servers table", () => {
  const { db, close } = withTempDb();
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);
    assert.ok(tables.includes("auth_settings"));
    assert.ok(tables.includes("auth_challenges"));
    assert.ok(tables.includes("sessions"));
    assert.ok(tables.includes("projects"));
    assert.ok(tables.includes("project_services"));
    assert.ok(tables.includes("jobs"));
    assert.ok(tables.includes("job_logs"));
    assert.ok(tables.includes("audit_events"));
    assert.equal(tables.includes("servers"), false);
    assert.equal(tables.includes("deployments"), false);
    const cols = db.prepare("PRAGMA table_info(auth_settings)").all() as Array<{ name: string }>;
    assert.deepEqual(
      cols.map((c) => c.name).sort(),
      ["failed_attempts", "id", "key_hash", "locked_until", "totp_enabled", "totp_secret_encrypted", "updated_at"],
    );
  } finally {
    close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/db/client.test.ts`  
Expected: FAIL (`Cannot find module` или `openDb is not a function`)

- [ ] **Step 3: Write minimal implementation**

`package.json` scripts:

```json
{
  "name": "manager-projects",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1 --port 3100",
    "build": "next build",
    "start": "next start --hostname 127.0.0.1 --port 3100",
    "test": "tsx --test src/**/*.test.ts"
  }
}
```

Зависимости: `next@14.2.5`, `react@18.3.1`, `react-dom@18.3.1`, `better-sqlite3`, `argon2`, `otplib`, `js-yaml`. Dev: `typescript@5.4.5`, `tsx`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`, `@types/js-yaml`.

`src/lib/db/schema.ts` — `CREATE TABLE` ровно для восьми таблиц из спеки. `auth_settings.id` INTEGER PRIMARY KEY CHECK (id = 1). `totp_enabled` INTEGER 0/1. `locked_until` TEXT nullable ISO. Остальные поля как в спеке плюс суррогатные `id` INTEGER PK.

`src/lib/db/client.ts`:

```ts
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
```

`withTempDb` создаёт файл в `os.tmpdir()`, вызывает `openDb`, `close` делает `db.close()` и `fs.unlinkSync`.

`.env.example`:

```
MANAGER_MASTER_KEY=
MANAGER_DB_PATH=./data/manager.sqlite
```

`.gitignore`: `node_modules`, `.next`, `data/`, `.env`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/db/client.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе пользователя)

```bash
git add package.json tsconfig.json next.config.mjs .gitignore .env.example src/lib/db src/lib/test
git commit -m "feat: add sqlite schema and test harness"
```

---

### Task 2: Хеш ключа и шифрование TOTP

**Files:**
- Create: `src/lib/crypto/hash.ts`
- Create: `src/lib/crypto/hash.test.ts`
- Create: `src/lib/crypto/encrypt.ts`
- Create: `src/lib/crypto/encrypt.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `hashSecret(plain: string): Promise<string>`
  - `verifySecret(plain: string, hash: string): Promise<boolean>`
  - `encryptString(plain: string, masterKey: string): string`
  - `decryptString(payload: string, masterKey: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/crypto/hash.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { hashSecret, verifySecret } from "./hash";

test("argon2 hash verifies and does not store plaintext", async () => {
  const hash = await hashSecret("correct-horse-battery");
  assert.equal(hash.includes("correct-horse-battery"), false);
  assert.equal(await verifySecret("correct-horse-battery", hash), true);
  assert.equal(await verifySecret("wrong", hash), false);
});
```

```ts
// src/lib/crypto/encrypt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { encryptString, decryptString } from "./encrypt";

test("roundtrip and wrong key fails", () => {
  const enc = encryptString("JBSWY3DPEHPK3PXP", "master-key-32bytes-minimum-ok!!");
  assert.equal(enc.includes("JBSWY3DPEHPK3PXP"), false);
  assert.equal(decryptString(enc, "master-key-32bytes-minimum-ok!!"), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decryptString(enc, "other-key-32bytes-minimum-ok!!!!"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/crypto/hash.test.ts src/lib/crypto/encrypt.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

`hash.ts`: `argon2.hash` / `argon2.verify`, тип argon2id.

`encrypt.ts`: AES-256-GCM. Ключ: `scryptSync(masterKey, "mgrproj-totp", 32)`. Payload: `base64(iv + tag + ciphertext)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/crypto/hash.test.ts src/lib/crypto/encrypt.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/crypto
git commit -m "feat: add argon2 hashing and totp secret encryption"
```

---

### Task 3: Setup и первый шаг логина

**Files:**
- Create: `src/lib/auth/types.ts`
- Create: `src/lib/auth/setup.ts`
- Create: `src/lib/auth/setup.test.ts`
- Create: `src/lib/auth/login.ts`
- Create: `src/lib/auth/login.test.ts`
- Create: `src/lib/db/paths.ts`

**Interfaces:**
- Consumes: `openDb`, `hashSecret`, `verifySecret`
- Produces:
  - `type SubmitKeyResult = { kind: "session"; token: string } | { kind: "challenge"; token: string } | { kind: "invalid" } | { kind: "locked"; until: Date }`
  - `hasKey(db: Database): boolean`
  - `createSetup(db: Database, key: string): Promise<{ token: string }>` — бросает `{ code: "KEY_TOO_SHORT" }` если `key.length < 16`; бросает `{ code: "ALREADY_SETUP" }` если хеш уже есть
  - `submitKey(db: Database, key: string, clientIp: string, now?: Date): Promise<SubmitKeyResult>`
  - `CHALLENGE_TTL_MS = 5 * 60 * 1000`
  - `SESSION_TTL_MS = 12 * 60 * 60 * 1000`
  - `KEY_LOCK_AFTER = 8`
  - `KEY_LOCK_MS = 15 * 60 * 1000`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/auth/setup.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup, hasKey } from "./setup";

test("setup rejects short key and second setup", async () => {
  const { db, close } = withTempDb();
  try {
    assert.equal(hasKey(db), false);
    await assert.rejects(() => createSetup(db, "short"), (e: { code: string }) => e.code === "KEY_TOO_SHORT");
    const first = await createSetup(db, "sixteen-chars-ok");
    assert.equal(typeof first.token, "string");
    assert.equal(hasKey(db), true);
    await assert.rejects(() => createSetup(db, "sixteen-chars-ok"), (e: { code: string }) => e.code === "ALREADY_SETUP");
  } finally {
    close();
  }
});
```

```ts
// src/lib/auth/login.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";
import { enableTotpForTest } from "./totp"; // появится в Task 4 — пока заглушку не импортировать

test("wrong key is invalid; right key without totp is session", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const bad = await submitKey(db, "wrong-key-not-it", "1.1.1.1");
    assert.equal(bad.kind, "invalid");
    const good = await submitKey(db, "sixteen-chars-ok", "1.1.1.1");
    assert.equal(good.kind, "session");
    if (good.kind === "session") assert.ok(good.token.length >= 32);
    const row = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    assert.equal(row.n, 2); // setup session + login session
  } finally {
    close();
  }
});
```

Поправка: `createSetup` создаёт сессию (спека: после setup сразу session). Тогда после setup `sessions` уже 1, после login без TOTP — 2. Тест выше это учитывает.

Не импортировать `enableTotpForTest` в этом файле на Task 3. Кейс «верный ключ + TOTP → challenge» добавляется в Task 4.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/auth/setup.test.ts src/lib/auth/login.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

`createSetup`: проверить длину, `hasKey`, `hashSecret`, `INSERT auth_settings` (`id=1`, `totp_enabled=0`, `failed_attempts=0`), создать session token `crypto.randomBytes(32).toString("hex")`, в БД `token_hash = sha256(token)`.

`submitKey`: если `locked_until > now` → `{ kind: "locked", until }`. `verifySecret`. Неверно: `failed_attempts++`, при `>= 8` выставить `locked_until = now+15m`, вернуть `invalid` (не `locked` на этой же попытке, если счётчик только что достиг 8 — следующая попытка уже `locked`; на 8-й ещё `invalid`, чтобы не раскрывать состояние? Спека: после 8 неудач lock. Реализация: 8-я неудача ставит lock и возвращает `locked`, чтобы UI сразу показал таймер). Зафиксировать: **8-я неверная попытка возвращает `{ kind: "locked", until }`**.

Верно и `totp_enabled=0`: сбросить `failed_attempts`, создать session.  
Верно и `totp_enabled=1`: сбросить `failed_attempts`, создать challenge (token hex, hash sha256, `client_ip`, `expires_at=now+5m`, `attempts=0`). Session не создавать.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/auth/setup.test.ts src/lib/auth/login.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/auth src/lib/db/paths.ts
git commit -m "feat: add setup and key login without totp"
```

---

### Task 4: TOTP, IP-привязка, lockout, сжигание challenge

**Files:**
- Create: `src/lib/auth/totp.ts`
- Create: `src/lib/auth/totp.test.ts`
- Modify: `src/lib/auth/login.test.ts` — кейсы TOTP и lockout
- Modify: `src/lib/auth/login.ts` — ветка `totp_enabled`

**Interfaces:**
- Consumes: `submitKey`, `encryptString`, `decryptString`, `verifySecret`
- Produces:
  - `type VerifyTotpResult = { kind: "session"; token: string } | { kind: "invalid" } | { kind: "expired" } | { kind: "ip_mismatch" }`
  - `verifyTotp(db: Database, challengeToken: string, code: string, clientIp: string, now?: Date): Promise<VerifyTotpResult>`
  - `TOTP_ATTEMPTS_MAX = 5`
  - `beginTotpEnroll(db: Database, masterKey: string): { secret: string; otpauthUrl: string }` — секрет ещё не включается (`totp_enabled` остаётся 0, секрет можно держать в памяти вызывающего; в БД не писать до confirm)
  - `confirmTotpEnroll(db: Database, masterKey: string, secret: string, code: string): boolean` — при успехе шифрует секрет, `totp_enabled=1`, сжигает все challenge
  - `generateTotpCode(secret: string, at?: Date): string` — только для тестов, обёртка над otplib

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/auth/totp.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { createSetup } from "./setup";
import { submitKey } from "./login";
import { confirmTotpEnroll, generateTotpCode, verifyTotp } from "./totp";

const KEY = "sixteen-chars-ok";
const MASTER = "master-key-32bytes-minimum-ok!!";

test("valid key with totp returns challenge not session", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    assert.equal(confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret)), true);
    const res = await submitKey(db, KEY, "10.0.0.8");
    assert.equal(res.kind, "challenge");
    const sessions = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    assert.equal(sessions.n, 1); // only setup session
  } finally {
    close();
  }
});

test("totp from other ip is ip_mismatch and does not create session", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    const res = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.9");
    assert.equal(res.kind, "ip_mismatch");
    const n = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    assert.equal(n, 1);
  } finally {
    close();
  }
});

test("five bad totp codes burn challenge", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    for (let i = 0; i < 5; i++) {
      const res = await verifyTotp(db, ch.token, "000000", "10.0.0.8");
      assert.equal(res.kind, "invalid");
    }
    const sixth = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.8");
    assert.equal(sixth.kind, "expired");
  } finally {
    close();
  }
});

test("matching ip and code creates session and deletes challenge", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, KEY);
    const secret = "JBSWY3DPEHPK3PXP";
    confirmTotpEnroll(db, MASTER, secret, generateTotpCode(secret));
    const ch = await submitKey(db, KEY, "10.0.0.8");
    if (ch.kind !== "challenge") throw new Error("expected challenge");
    const res = await verifyTotp(db, ch.token, generateTotpCode(secret), "10.0.0.8");
    assert.equal(res.kind, "session");
    const left = (db.prepare("SELECT COUNT(*) AS n FROM auth_challenges").get() as { n: number }).n;
    assert.equal(left, 0);
  } finally {
    close();
  }
});
```

В `login.test.ts` добавить:

```ts
test("eighth wrong key locks for 15 minutes", async () => {
  const { db, close } = withTempDb();
  try {
    await createSetup(db, "sixteen-chars-ok");
    const now = new Date("2026-09-13T10:00:00Z");
    for (let i = 0; i < 7; i++) {
      const res = await submitKey(db, "wrong-key-not-it", "1.1.1.1", now);
      assert.equal(res.kind, "invalid");
    }
    const locked = await submitKey(db, "wrong-key-not-it", "1.1.1.1", now);
    assert.equal(locked.kind, "locked");
    if (locked.kind === "locked") {
      assert.equal(locked.until.toISOString(), "2026-09-13T10:15:00.000Z");
    }
    const still = await submitKey(db, "sixteen-chars-ok", "1.1.1.1", now);
    assert.equal(still.kind, "locked");
  } finally {
    close();
  }
});
```

UI не различает `ip_mismatch` и `invalid`: action наверху мапит оба в «Неверные данные». Доменный слой возвращает точный kind — так тест может проверить привязку.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/auth/totp.test.ts src/lib/auth/login.test.ts`  
Expected: FAIL на отсутствующем `verifyTotp` / lock ещё не реализован

- [ ] **Step 3: Write minimal implementation**

`verifyTotp`: найти challenge по `sha256(token)`. Нет или `expires_at <= now` → `expired` и удалить. `client_ip !== clientIp` → `ip_mismatch` (попытку не увеличивать? Увеличивать, чтобы брутфорс с разных IP из украденного токена тоже сжигал. Зафиксировать: **ip_mismatch увеличивает attempts**). Неверный код: `attempts++`, при `>= 5` удалить challenge, вернуть `invalid` на 5-й и `expired` на последующих. Верный: `authenticator.check`, удалить challenge, создать session.

`confirmTotpEnroll`: `authenticator.check(code, secret)`, иначе false. Успех: `encryptString`, update settings, `DELETE FROM auth_challenges`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/auth`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/auth
git commit -m "feat: add totp challenge with ip binding and key lockout"
```

---

### Task 5: Guard путей и клиентский IP

**Files:**
- Create: `src/lib/auth/guard.ts`
- Create: `src/lib/auth/guard.test.ts`
- Create: `src/lib/auth/client-ip.ts`
- Create: `src/lib/auth/client-ip.test.ts`
- Create: `src/lib/auth/cookies.ts`

**Interfaces:**
- Consumes: session/challenge rows in db
- Produces:
  - `type GuardIdentity = { kind: "anon" } | { kind: "challenge" } | { kind: "session"; sessionId: number }`
  - `resolveIdentity(db: Database, cookies: { session?: string; challenge?: string }, now?: Date): GuardIdentity`
  - `isPublicPath(pathname: string, hasKeyConfigured: boolean): boolean`
  - `canAccessPath(identity: GuardIdentity, pathname: string, hasKeyConfigured: boolean): boolean`
  - `readClientIp(input: { remoteAddress?: string; forwardedFor?: string }): string`
  - Cookie names: `COOKIE_SESSION = "mgr_session"`, `COOKIE_CHALLENGE = "mgr_challenge"`
  - `sessionCookieOptions(https: boolean)`, `challengeCookieOptions(https: boolean)`

Whitelist публичных путей:

- всегда: `/login`, `/_next`, favicon
- `/login/totp` публичен только для `challenge` (для `anon` — нет, редирект на `/login`)
- `/setup` публичен только если `hasKeyConfigured === false`

`canAccessPath`:

| identity | path | result |
|----------|------|--------|
| anon | `/login` | true |
| anon | `/` | false |
| anon | `/setup` если ключа нет | true |
| anon | `/setup` если ключ есть | false |
| anon | `/login/totp` | false |
| challenge | `/login/totp` | true |
| challenge | `/` | false |
| challenge | `/settings` | false |
| challenge | `/login` | true (чтобы начать заново) |
| session | `/` `/projects/x` `/settings` | true |
| session | `/setup` | false |

- [ ] **Step 1: Write the failing tests**

Таблица из `canAccessPath` — по одному `assert.equal` на строку в `guard.test.ts`.

```ts
// src/lib/auth/client-ip.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readClientIp } from "./client-ip";

test("trusts x-forwarded-for only from loopback", () => {
  assert.equal(
    readClientIp({ remoteAddress: "127.0.0.1", forwardedFor: "203.0.113.4, 10.0.0.1" }),
    "203.0.113.4",
  );
  assert.equal(
    readClientIp({ remoteAddress: "198.51.100.2", forwardedFor: "203.0.113.4" }),
    "198.51.100.2",
  );
  assert.equal(readClientIp({ remoteAddress: "::1", forwardedFor: "203.0.113.4" }), "203.0.113.4");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/auth/guard.test.ts src/lib/auth/client-ip.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`isLoopback`: `127.0.0.1`, `::1`, `:ffff:127.0.0.1`. Если loopback и есть `forwardedFor` — первый hop (trim, до запятой). Иначе `remoteAddress` без префикса IPv4-mapped.

`resolveIdentity`: сначала session cookie (валидный незаexpired hash), иначе challenge cookie, иначе anon. Просроченные строки удалять.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/auth/guard.test.ts src/lib/auth/client-ip.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/auth
git commit -m "feat: add path guard and trusted client ip"
```

---

### Task 6: Экраны setup/login/totp и middleware

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/setup/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/totp/page.tsx`
- Create: `src/app/page.tsx` — пока заглушка «скоро список», чтобы флоу входа замыкался
- Create: `src/screens/SetupScreen.tsx`
- Create: `src/screens/LoginScreen.tsx`
- Create: `src/screens/TotpScreen.tsx`
- Create: `src/components/auth/KeyForm.tsx`
- Create: `src/components/auth/TotpForm.tsx`
- Create: `src/app/actions/auth.ts`
- Create: `src/lib/auth/guard.test.ts` — уже есть; добавить тест `isPublicPath` для `/_next/static/chunk.js`
- Create: `src/screens/SetupScreen.test.ts` — чистая функция валидации формы, не RTL

**Interfaces:**
- Consumes: `createSetup`, `submitKey`, `verifyTotp`, `canAccessPath`, cookie helpers
- Produces:
  - server actions: `setupAction`, `loginAction`, `totpAction`, `logoutAction`
  - `validateSetupFields(a: string, b: string): { ok: true; key: string } | { ok: false; message: string }`
  - UI copy: «Неверные данные»; «Попробуйте через N минут»; «Ключ не короче 16 символов»; «Ключи не совпадают»

`page.tsx` файлы:

```tsx
import { SetupScreen } from "../../screens/SetupScreen";
export default function Page() {
  return <SetupScreen />;
}
```

То же для login/totp. Никакой вёрстки в page.

Actions: читают IP через `headers()` + `readClientIp`, ставят cookies через `cookies()` из `next/headers`. `totpAction` мапит `ip_mismatch` и `invalid` в одно сообщение. Неверный/просроченный challenge → redirect `/login`.

Middleware: открыть db (или лёгкий hasKey + identity). Если `!canAccessPath` — redirect `/login` или `/setup`. Не пускать session на `/setup`.

- [ ] **Step 1: Write the failing test for form validation**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateSetupFields } from "./SetupScreen";

test("setup form messages", () => {
  assert.deepEqual(validateSetupFields("short", "short"), {
    ok: false,
    message: "Ключ не короче 16 символов",
  });
  assert.deepEqual(validateSetupFields("sixteen-chars-ok", "sixteen-chars-no"), {
    ok: false,
    message: "Ключи не совпадают",
  });
  assert.deepEqual(validateSetupFields("sixteen-chars-ok", "sixteen-chars-ok"), {
    ok: true,
    key: "sixteen-chars-ok",
  });
});
```

Вынести `validateSetupFields` в `src/lib/auth/setup-form.ts`, экран только вызывает её — чтобы screen-файл не тащил React в node:test. Тогда test file: `src/lib/auth/setup-form.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/auth/setup-form.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement validation, screens, actions, middleware**

Минимальный CSS (без UI-библиотек, как volleyball): форма, кнопка, ошибка.

`next.config.mjs`: пустой `reactStrictMode: true`.

`layout.tsx`: html/body + `{children}`.

- [ ] **Step 4: Run unit tests**

Run: `npx tsx --test src/lib/auth`  
Expected: PASS

Ручная проверка после `npm run dev`: `/` → `/setup` на пустой базе; после ключа `/setup` → `/login` для анона и `/` для session.

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/app src/screens src/components/auth src/middleware.ts src/lib/auth
git commit -m "feat: add setup and two-step login screens"
```

---

### Task 7: Скан проектов

**Files:**
- Create: `src/lib/projects/types.ts`
- Create: `src/lib/projects/repo.ts`
- Create: `src/lib/projects/scan.ts`
- Create: `src/lib/projects/scan.test.ts`
- Create: `src/lib/docker/types.ts`

**Interfaces:**
- Consumes: db
- Produces:
  - `type ComposeListItem = { name: string; configFiles: string; running: boolean }`
  - `type ScanPathSettings = { roots: string[] }`
  - `applyScan(db: Database, items: ComposeListItem[]): { created: string[]; reused: string[] }`
  - `listProjects(db: Database): ProjectRow[]`
  - `parseComposeServices(yamlText: string): Array<{ name: string; hostPort: number | null; containerName: string | null }>`
  - `slugFromName(name: string): string`

`applyScan`: для каждого item, если нет строки с тем же `compose_project` или тем же нормализованным `compose_file` — INSERT project (`source=discovered`, `name` из compose name, `root_path` = dirname первого config file, `compose_file` = первый файл). Если есть — **не** обновлять `name`, `description`, `image_path`. Сервисы: если у проекта ещё нет `project_services`, распарсить YAML и вставить черновики (`health_kind=http` если порт есть, `health_path=/health`, `is_primary=true` для первого не-db, `is_ui=true` если имя содержит `web`/`frontend`/`ui`).

Парсер портов: короткой записи `"3000:3000"` и long syntax `published` / `target`. Игнорировать переменные как есть: если порт не число — `hostPort=null`.

- [ ] **Step 1: Write the failing tests**

```ts
test("scan creates from compose ls and does not overwrite manual description", () => {
  const { db, close } = withTempDb();
  try {
    applyScan(db, [
      { name: "volleyball", configFiles: "C:\\\\fake\\\\volleyball\\\\docker-compose.yml", running: true },
    ]);
    db.prepare("UPDATE projects SET description = 'keep me', name = 'Volleyball UI' WHERE compose_project = ?")
      .run("volleyball");
    applyScan(db, [
      { name: "volleyball", configFiles: "C:\\\\fake\\\\volleyball\\\\docker-compose.yml", running: false },
    ]);
    const row = db.prepare("SELECT name, description FROM projects WHERE compose_project = ?").get("volleyball") as {
      name: string;
      description: string;
    };
    assert.equal(row.name, "Volleyball UI");
    assert.equal(row.description, "keep me");
  } finally {
    close();
  }
});

test("parseComposeServices reads host ports", () => {
  const yaml = `
services:
  backend:
    ports:
      - "3001:3001"
  frontend:
    container_name: volleyball_frontend
    ports:
      - published: 3000
        target: 3000
`;
  const services = parseComposeServices(yaml);
  assert.equal(services.find((s) => s.name === "backend")?.hostPort, 3001);
  assert.equal(services.find((s) => s.name === "frontend")?.containerName, "volleyball_frontend");
  assert.equal(services.find((s) => s.name === "frontend")?.hostPort, 3000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/projects/scan.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement parse + applyScan**

Реальный `docker compose ls` вызывается только из runner в Task 9, не из `applyScan`. Скан action передаёт результат CLI в `applyScan`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/projects/scan.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/projects src/lib/docker/types.ts
git commit -m "feat: add compose scan without overwriting manual metadata"
```

---

### Task 8: Каскад статуса и чип доступности

**Files:**
- Create: `src/lib/status/aggregate.ts`
- Create: `src/lib/status/aggregate.test.ts`
- Create: `src/lib/status/access.ts`
- Create: `src/lib/status/access.test.ts`
- Create: `src/lib/status/probes.ts`
- Create: `src/lib/docker/types.ts` (если ещё не создан)

**Interfaces:**
- Consumes: project_services rows
- Produces:
  - `type ContainerFact = { name: string; running: boolean; health: "healthy" | "unhealthy" | "none"; binds: Array<{ port: number; address: string }> }`
  - `type ProbeResult = { serviceName: string; ok: boolean | null }`
  - `type ProjectStatus = "running" | "degraded" | "unhealthy" | "stopped"`
  - `aggregateStatus(input: { containers: ContainerFact[]; primaries: Array<{ name: string; healthKind: "http" | "tcp" | "docker" | "none" }>; probes: ProbeResult[] }): ProjectStatus`
  - `type AccessLevel = "machine" | "lan" | "lan_unconfirmed" | "none"`
  - `resolveAccess(input: { status: ProjectStatus; binds: Array<{ port: number; address: string }>; firewallPorts: number[] }): AccessLevel`

Правила `aggregateStatus` (зафиксировать однозначно):

- `containers.length === 0` или ни один `running` → `stopped`
- есть running, все primary с `healthKind !== none` имеют `probes.ok === true` (или kind `docker` и container health `healthy`/`none` при running) → `running`
- есть running, хотя бы один primary `probes.ok === false` или docker `unhealthy` → `unhealthy`
- есть running, пробы `null` (ещё нет / kind none) или смесь up+нет ответа трактуется как `degraded`, если ни один primary явно не false, но и не все true

`resolveAccess`:

- `status === stopped` → `none`
- все bind address `127.0.0.1` или `::1` → `machine`
- есть `0.0.0.0` или `::` и каждый такой порт ∈ `firewallPorts` → `lan`
- есть `0.0.0.0`/`::` и хотя бы один порт не в firewall → `lan_unconfirmed`

- [ ] **Step 1: Write failing tests for each row of the tables above** (отдельные `test()` на stopped / running / degraded / unhealthy и три access)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/status/aggregate.test.ts src/lib/status/access.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement pure functions**

`probes.ts`: `probeHttp(port, path): Promise<boolean>` (`fetch` localhost, timeout 800ms, ok если 2xx/3xx), `probeTcp(port): Promise<boolean>` (`net.connect`). В unit-тестах aggregate/access **не** вызывать сеть — только чистые функции.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/status`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/status
git commit -m "feat: add status cascade and access chips"
```

---

### Task 9: Очередь задач, конфликт портов, запрет второго start

**Files:**
- Create: `src/lib/jobs/types.ts`
- Create: `src/lib/jobs/queue.ts`
- Create: `src/lib/jobs/queue.test.ts`
- Create: `src/lib/jobs/ports.ts`
- Create: `src/lib/jobs/ports.test.ts`
- Create: `src/lib/jobs/runner.ts`
- Create: `src/lib/docker/cli.ts`

**Interfaces:**
- Consumes: db, `applyScan` не обязателен
- Produces:
  - `enqueue(db, input: { projectId: number; type: JobType; targetAccess: "machine" | "lan" | null }): { ok: true; jobId: number } | { ok: false; reason: "busy" }`
  - `hasActiveLifecycleJob(db, projectId: number): boolean` — status `queued`|`running` и type in start/stop/restart
  - `appendLog(db, jobId, stream, line): void`
  - `findPortOwner(port: number, inspect: PortInspect[]): string | null`
  - `type PortInspect = { port: number; kind: "tcp"; owner: string }`
  - `runJob(db, jobId, deps: JobDeps): Promise<void>`
  - `type JobDeps = { composeUp(project: ProjectRow, access: "machine" | "lan"): AsyncIterable<string>; composeStop(project: ProjectRow): AsyncIterable<string>; listPorts(): Promise<PortInspect[]>; firewallAllow?(ports: number[]): Promise<{ ok: true } | { ok: false; message: string }>; firewallRevoke?(prefix: string): Promise<void> }`

`enqueue`: если `hasActiveLifecycleJob` и type ∈ start/stop/restart → `{ ok: false, reason: "busy" }`. Иначе INSERT `queued`.

`runJob` для `start`:

1. `running`, `started_at`
2. `listPorts`; если `host_port` проекта занят — log system «Порт N занят: {owner}», `failed`
3. если `targetAccess === lan` и `firewallAllow` вернул not ok — log, `failed`, **compose не вызывать**
4. стримить `composeUp` в `job_logs`
5. success / fail по коду deps (последняя строка или throw)

Для тестов `JobDeps` — фейки в памяти.

- [ ] **Step 1: Write failing tests**

```ts
test("second start while running is busy", () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db);
    const first = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(first.ok, true);
    db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(first.ok ? first.jobId : 0);
    const second = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "busy");
  } finally {
    close();
  }
});

test("start fails on port conflict before compose", async () => {
  const { db, close } = withTempDb();
  try {
    const projectId = insertFakeProject(db, { hostPort: 3000 });
    const q = enqueue(db, { projectId, type: "start", targetAccess: "machine" });
    if (!q.ok) throw new Error("enqueue");
    let composeCalled = false;
    await runJob(db, q.jobId, {
      async *composeUp() {
        composeCalled = true;
      },
      async *composeStop() {},
      async listPorts() {
        return [{ port: 3000, kind: "tcp", owner: "wiremock-gui" }];
      },
    });
    const job = db.prepare("SELECT status, error_summary FROM jobs WHERE id = ?").get(q.jobId) as {
      status: string;
      error_summary: string;
    };
    assert.equal(job.status, "failed");
    assert.match(job.error_summary, /3000/);
    assert.match(job.error_summary, /wiremock-gui/);
    assert.equal(composeCalled, false);
  } finally {
    close();
  }
});
```

`insertFakeProject` — хелпер в `queue.test.ts`, не отдельный прод-модуль.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/jobs/queue.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement queue + runJob**

`cli.ts` позже: spawn `docker compose -f <file> -p <name> up -d --build` и `stop`. Для `machine` env `COMPOSE_PUBLISH_ADDR=127.0.0.1` если в файле есть подстановка; иначе system-log предупреждение «compose публикует как есть». Не патчить YAML на диске.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/jobs`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/jobs src/lib/docker/cli.ts
git commit -m "feat: add job queue with port conflict and busy lock"
```

---

### Task 10: Помощник фаервола

**Files:**
- Create: `src/lib/firewall/parse.ts`
- Create: `src/lib/firewall/parse.test.ts`
- Create: `src/lib/firewall/names.ts`
- Create: `src/lib/firewall/names.test.ts`
- Create: `helper/firewall.mjs`
- Create: `src/lib/firewall/client.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type FwCommand = { action: "allow"; name: string; port: number } | { action: "revoke"; name: string } | { action: "list"; prefix: string }`
  - `parseFwArgv(argv: string[]): { ok: true; command: FwCommand } | { ok: false; message: string }`
  - `ruleName(slug: string, port: number): string` → `mgrproj-${slug}-${port}` (slug уже `[a-z0-9-]+`)
  - `RULE_PREFIX = "mgrproj-"`
  - `parseFwArgv` отвергает неизвестную команду, `--name` без префикса `mgrproj-`, порт вне 1–65535, лишние аргументы
  - `helper/firewall.mjs`: парсит argv той же логикой (скопировать чистые функции в `.mjs` **нельзя** — helper импортирует собранный parse либо дублирует parse в одном файле `helper/firewall.mjs` и реэкспортирует из `parse.ts` через чтение? Чтобы не дублировать: `parse.ts` — источник истины; helper запускается `node helper/firewall.mjs` и для CI тестируется только `parse.ts`. Helper в runtime: если parse ок, печатает JSON и **в тестах не вызывается**. Реальный `netsh` только когда `process.env.MGR_FW_DRY !== "1"`. По умолчанию в unit-тестах helper не запускать.
  - `client.ts`: `runFirewall(cmd): Promise<{ ok: boolean; message?: string; names?: string[] }>` spawn `node helper/firewall.mjs ...`. Если exit 2 — нет elevation, `ok: false`, message «Нужны права администратора для правила фаервола».

- [ ] **Step 1: Write failing tests**

```ts
test("parse rejects unknown and non-prefixed names", () => {
  assert.equal(parseFwArgv(["boom"]).ok, false);
  assert.equal(parseFwArgv(["allow", "--name", "evil", "--port", "80"]).ok, false);
  assert.deepEqual(parseFwArgv(["allow", "--name", "mgrproj-volley-3000", "--port", "3000"]), {
    ok: true,
    command: { action: "allow", name: "mgrproj-volley-3000", port: 3000 },
  });
});

test("ruleName uses prefix slug port", () => {
  assert.equal(ruleName("volleyball", 3000), "mgrproj-volleyball-3000");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/firewall/parse.test.ts src/lib/firewall/names.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement parse, names, helper, client**

`helper/firewall.mjs` при `allow`:  
`netsh advfirewall firewall add rule name=... dir=in action=allow protocol=TCP localport=... profile=private,domain`  
`revoke`: `delete rule name=...`  
`list`: `show rule name=all` и фильтр по prefix (или хранить имена, которые сами создали — list всё равно фильтрует prefix).  
Exit codes: 0 ok, 1 parse/netsh error, 2 elevation missing (детект по тексту netsh / статусу).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/firewall`  
Expected: PASS

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/lib/firewall helper/firewall.mjs
git commit -m "feat: add firewall helper whitelist parser"
```

---

### Task 11: Список, деталка, диалог запуска

**Files:**
- Create: `src/screens/ProjectListScreen.tsx`
- Create: `src/screens/ProjectDetailScreen.tsx`
- Create: `src/components/layout/AppHeader.tsx`
- Create: `src/components/layout/TotpBanner.tsx`
- Create: `src/components/projects/ProjectCard.tsx`
- Create: `src/components/projects/StatusChip.tsx`
- Create: `src/components/projects/AccessChip.tsx`
- Create: `src/components/projects/StartDialog.tsx`
- Create: `src/components/projects/ServiceTable.tsx`
- Create: `src/components/jobs/JobLog.tsx`
- Modify: `src/app/page.tsx` — композиция списка
- Create: `src/app/projects/[slug]/page.tsx`
- Create: `src/app/actions/projects.ts`
- Create: `src/app/actions/jobs.ts`
- Create: `src/lib/status/labels.ts`
- Create: `src/lib/status/labels.test.ts`
- Create: `src/lib/network/lan.ts`

**Interfaces:**
- Consumes: listProjects, aggregateStatus, resolveAccess, enqueue, job logs
- Produces:
  - `statusLabel(status: ProjectStatus): string` — «работает» / «деградировал» / «нездоров» / «не запущен»
  - `accessLabel(level: AccessLevel): string` — «только машина» / «локалка» / «локалка без фаервола» / "" 
  - `openUrl(level: AccessLevel, lanIp: string | null, port: number): string` — lan/lan_unconfirmed + lanIp → `http://{lanIp}:{port}`, иначе `http://127.0.0.1:{port}`

Чипы: цвет через CSS-классы `chip-ok`, `chip-warn`, `chip-bad`, `chip-muted`. Не один цвет на все.

`StartDialog`: две кнопки-выбора `machine` | `lan`. Если профиль сети `Public` — текст «Сеть помечена как Public: правило private может не сработать». На подтверждении вызывает `startJobAction(slug, access)`. Пока job running — лог внутри диалога (поллинг `getJobAction` раз в 1с).

`ProjectListScreen` props: `{ projects: ProjectCardModel[]; dockerOk: boolean; lanIp: string | null; totpEnabled: boolean }`. Пустой список — кнопка «Найти проекты на машине» → `scanAction`. Docker down — баннер, кнопки старта `disabled`.

`page.tsx` корня: server component грузит данные, передаёт в `ProjectListScreen`.

Деталка: фото (`image_path` или плейсхолдер), описание, таблица сервисов с результатом пробы, контролы, confirm на стоп (`window.confirm("Остановить проект?")`), лог последней job, ссылка «К списку» → `/`.

- [ ] **Step 1: Write failing tests for labels and openUrl**

```ts
test("labels and open urls", () => {
  assert.equal(statusLabel("running"), "работает");
  assert.equal(accessLabel("lan_unconfirmed"), "локалка без фаервола");
  assert.equal(openUrl("lan", "192.168.1.89", 3000), "http://192.168.1.89:3000");
  assert.equal(openUrl("machine", "192.168.1.89", 3000), "http://127.0.0.1:3000");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/status/labels.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement labels, screens, actions**

`lan.ts`: на Windows `Get-NetIPAddress -AddressFamily IPv4` через spawn, фильтр не loopback / не APIPA; fallback первое `os.networkInterfaces()` IPv4 не internal. Профиль: `Get-NetConnectionProfile` → `Public`/`Private`/`Domain`/`unknown`. Ошибки → `unknown` / `null`, не падать.

`docker/cli.ts`: `docker compose ls --format json`; если docker не запущен — `dockerOk=false`.

- [ ] **Step 4: Run tests**

Run: `npx tsx --test src/lib/status src/lib/jobs src/lib/projects src/lib/auth`  
Expected: PASS

В браузере: скан → карточки; деталка слага; диалог старта (можно на погашенном neuro_coocking).

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src/app src/screens src/components src/lib
git commit -m "feat: add project list, detail, and start dialog"
```

---

### Task 12: Настройки, аудит, Caddy

**Files:**
- Create: `src/screens/SettingsScreen.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/actions/settings.ts`
- Create: `src/lib/auth/settings.ts`
- Create: `src/lib/auth/settings.test.ts`
- Create: `src/lib/audit/log.ts`
- Create: `src/lib/audit/log.test.ts`
- Create: `Caddyfile`
- Modify: `src/components/layout/AppHeader.tsx` — ссылка Настройки, LAN-IP, TotpBanner
- Create: `src/lib/projects/paths-settings.ts`
- Create: `src/lib/projects/paths-settings.test.ts`

**Interfaces:**
- Consumes: hash/verify, totp enroll, db
- Produces:
  - `changeKey(db, input: { oldKey: string; newKey: string; totpCode?: string; masterKey: string; keepSessionToken: string }): Promise<{ ok: true } | { ok: false; message: string }>` — при успехе удаляет все sessions кроме `keepSessionToken`
  - `writeAudit(db, event: { action: string; projectId?: number; jobId?: number; sessionId?: number; ip: string; outcome: "ok" | "fail"; detail?: Record<string, unknown> }): void` — `detail` не должен содержать ключи `key`, `totp`, `secret`, `token`
  - `sanitizeAuditDetail(detail: Record<string, unknown>): Record<string, unknown>`
  - `getScanRoots(db): string[]` / `setScanRoots(db, roots: string[])` — хранить JSON в `audit` нельзя; отдельная таблица не в спеке. Зафиксировать: таблица `app_settings(key TEXT PRIMARY KEY, value TEXT)` добавляется миграцией в этом таске (это не servers/deployments). Ключ `scan_roots`. Дефолт: `C:\Users\gunfe\projects` и `os.homedir()`.
  - Actions: `changeKeyAction`, `enrollTotpStartAction` (вернёт otpauth один раз в ответе действия, не в последующих GET), `enrollTotpConfirmAction`, `saveRootsAction`, `scanAction`
  - Аудит actions: `setup`, `login`, `login_totp`, `logout`, `change_key`, `totp_enable`, `start`, `stop`, `restart`, `scan`

`enrollTotpStartAction`: секрет только в ответе этого POST. GET `/settings` секрет не отдаёт.

`SettingsScreen`: три секции как в спеке. Баннер TOTP если `!totpEnabled`.

`Caddyfile`:

```
{$MANAGER_DOMAIN:localhost} {
  reverse_proxy 127.0.0.1:3100
}
```

- [ ] **Step 1: Write failing tests**

```ts
test("changeKey revokes other sessions", async () => {
  const { db, close } = withTempDb();
  try {
    const setup = await createSetup(db, "sixteen-chars-ok");
    const other = await submitKey(db, "sixteen-chars-ok", "1.1.1.1");
    if (other.kind !== "session") throw new Error("session");
    const res = await changeKey(db, {
      oldKey: "sixteen-chars-ok",
      newKey: "another-sixteen-xx",
      keepSessionToken: setup.token,
      masterKey: "master-key-32bytes-minimum-ok!!",
    });
    assert.equal(res.ok, true);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    assert.equal(n, 1);
  } finally {
    close();
  }
});

test("sanitizeAuditDetail strips secrets", () => {
  const clean = sanitizeAuditDetail({ key: "x", totp: "123", port: 3000 });
  assert.deepEqual(clean, { port: 3000 });
});

test("scan roots default and persist", () => {
  const { db, close } = withTempDb();
  try {
    const roots = getScanRoots(db);
    assert.ok(roots.length >= 1);
    setScanRoots(db, ["D:\\\\work"]);
    assert.deepEqual(getScanRoots(db), ["D:\\\\work"]);
  } finally {
    close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/auth/settings.test.ts src/lib/audit/log.test.ts src/lib/projects/paths-settings.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement settings, audit, Caddy, header banner**

`runJob` / login / setup / totp / changeKey вызывают `writeAudit`.

Дописать `SCHEMA_SQL` таблицей `app_settings` (идемпотентный `CREATE TABLE IF NOT EXISTS`). Тест из Task 1 обновить: таблица должна появиться, `servers` по-прежнему нет.

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`  
Expected: PASS, включая обязательные кейсы спеки 1–10:

1. guard whitelist — Task 5  
2. setup open/closed — Task 3 + 5  
3. login session vs challenge — Task 3–4  
4. TOTP IP / 5 attempts — Task 4  
5. lockout 8 — Task 4  
6. status fixtures — Task 8  
7. access binds — Task 8  
8. port busy + second start — Task 9  
9. firewall parse — Task 10  
10. scan no overwrite — Task 7  

- [ ] **Step 5: Commit** (только по просьбе)

```bash
git add src Caddyfile src/lib/db/schema.ts
git commit -m "feat: add settings, audit log, and caddyfile"
```

---

## Self-review

**Spec coverage**

| Спека | Задача |
|-------|--------|
| Setup / двухшаговый логин / challenge / IP | 3, 4, 6 |
| Lockout 8 / 15 мин | 4 |
| Guard whitelist | 5, 6 |
| Смена ключа, TOTP enroll один раз | 12 |
| Таблицы без servers/deployments | 1, 12 (`app_settings` только) |
| Скан не затирает метаданные | 7 |
| Каскад статуса и чипы доступа | 8, 11 |
| Jobs, порт, busy | 9 |
| machine/lan, фаервол до compose | 9, 10, 11 |
| Экраны список/деталка/настройки | 6, 11, 12 |
| LAN-IP, профиль сети, banner TOTP | 11, 12 |
| Caddy + listen 127.0.0.1:3100 | 1 scripts, 12 Caddyfile |
| Аудит без секретов | 12 |
| Тесты 1–10 | размазаны по 3–10, финальный прогон в 12 |

**Сознательно не в плане (вне скоупа спеки):** SSH, серверы, правка чужих compose, мультипользователи.

**Типы:** `SubmitKeyResult`, `VerifyTotpResult`, `ProjectStatus`, `AccessLevel`, `enqueue`/`runJob` — одни и те же имена во всех задачах.
