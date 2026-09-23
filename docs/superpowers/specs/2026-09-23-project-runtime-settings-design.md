# Project runtime settings (compose + primary port)

Date: 2026-09-23  
Status: approved in chat; awaiting file review  
Related: `docs/superpowers/specs/2026-09-13-projects-manager-design.md`

## Goal

On the project detail page, surface the settings that decide how a project is launched: which compose file is used and which host port is treated as primary. Auto-detection stays; values are always visible and editable. Port check means “is this TCP port free on the machine”, not HTTP/TCP service health.

## Non-goals

- Editing Dockerfile as a separate launch contract (manager remains compose-based).
- Editing non-primary service ports in UI.
- Free-text absolute path for compose (dropdown of candidates only).
- Changing “Открыть” / probe semantics beyond using the saved primary `host_port`.

## UI

Placement: project detail (`ProjectDetailScreen`), section **«Настройки запуска»** above `ServiceTable`.

### Compose file

- Control: `<select>` of candidates under `projects.root_path`.
- Candidate globs (case-insensitive): `docker-compose*.yml`, `docker-compose*.yaml`, `compose*.yml`, `compose*.yaml` (non-recursive in `root_path` only).
- Always include the current `projects.compose_file` in the list if set, even when it does not match a glob or sits outside the usual names.
- Empty / no candidates: show current path as text (or empty state) and disable save for compose until a candidate exists.
- Save persists `projects.compose_file` and bumps `projects.updated_at`.

After a successful compose-file change:

1. Re-parse YAML via existing `parseComposeServices`.
2. Sync services with existing `syncComposeServices` / draft insert rules: add missing services; fill `host_port` only when DB value is null; **do not overwrite** an already set `host_port` (manual or remapped).
3. Revalidate detail page.

### Primary port

- Editable number field bound to the service with `is_primary = 1`.
- If no primary exists, fall back to first `is_ui = 1` with a port, else first service with a non-null port (align with open/remap intent; document the chosen row in UI as «основной порт»).
- Field is pre-filled from DB (scan / previous remap / prior save). Auto-detection continues on scan and on compose change for **null** ports only.
- **Сохранить** → `updateServiceHostPort` for that service id.
- **Проверить** → live check via existing `listListeningPorts` + `findPortOwner`:
  - free → «свободен»;
  - taken → «занят: &lt;owner&gt;».
- Check does not persist. Save does not require a prior successful check.
- Validation on save: integer in `1024…65535` (same band as remap allocator). Invalid → clear error message, no write.

### Service table

Unchanged: read-only name / port / probe (health). Probe remains health; do not reuse “свободен” language there.

## Data & actions

No schema migration. Use existing columns:

- `projects.compose_file`, `projects.root_path`
- `project_services.host_port`, `is_primary`, `is_ui`

Server actions (session-guarded, same pattern as `settings` / `jobs`):

- `saveProjectComposeAction(slug, composeFile)` — path must resolve under `root_path` or equal normalized current absolute path already stored; reject path traversal.
- `savePrimaryPortAction(slug, port)` — updates primary (or fallback) service only.
- `checkHostPortAction(port)` — returns `{ free: true } | { free: false; owner: string }` (owner may be generic if inspect empty).

Domain helpers (prefer `src/lib/projects/`):

- `listComposeCandidates(rootPath): string[]`
- wire save + optional resync in one transactional-ish DB sequence

## Interaction with scan / start

- Scan (`applyScan`): keep current behavior — match by `compose_project` / file; sync services without clobbering set ports.
- Start / remap (`runner` + `allocateHostPorts`): continue to use DB `host_port` as desired ports; manual primary remains the source of truth until remapped at start time (remap still updates DB as today).

## Testing

- Unit: candidate listing (globs, includes current odd name); path allowlist rejection; primary port validation bounds; port-check mapping free/busy using mocked inspect.
- Unit/integration: saving compose triggers service sync without overwriting existing host ports.
- UI not required in node tests; cover domain + actions via existing `tsx --test` style.

## Acceptance

1. Detail shows compose select with detected file selected.
2. Changing compose and saving updates DB and refreshes services without wiping a remapped primary port.
3. Primary port field shows auto value; user can change and save.
4. «Проверить» reports free vs occupied with owner when known.
5. Non-primary ports stay read-only in the table.
