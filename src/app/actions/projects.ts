"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { writeAudit } from "../../lib/audit/log";
import { COOKIE_SESSION } from "../../lib/auth/cookies";
import { readRequestIp } from "../../lib/auth/client-ip";
import { resolveIdentity } from "../../lib/auth/guard";
import { requireSessionForAction } from "../../lib/auth/require-action";
import { composeLs } from "../../lib/docker/cli";
import { getRuntimeDb } from "../../lib/db/client";
import { listListeningPorts } from "../../lib/jobs/ports";
import { applyScan } from "../../lib/projects/scan";
import {
  checkHostPortFree,
  parseHostPortInput,
  savePrimaryPort,
  saveProjectCompose,
} from "../../lib/projects/runtime-settings";

export async function scanAction(): Promise<void> {
  await requireSessionForAction();
  const db = getRuntimeDb();
  const listed = await composeLs();
  const identity = resolveIdentity(db, { session: cookies().get(COOKIE_SESSION)?.value });
  if (listed.ok) {
    applyScan(db, listed.items);
    writeAudit(db, {
      action: "scan",
      sessionId: identity.kind === "session" ? identity.sessionId : undefined,
      ip: readRequestIp(headers()),
      outcome: "ok",
    });
  } else {
    writeAudit(db, {
      action: "scan",
      sessionId: identity.kind === "session" ? identity.sessionId : undefined,
      ip: readRequestIp(headers()),
      outcome: "fail",
    });
  }
  revalidatePath("/");
  revalidatePath("/projects", "layout");
  revalidatePath("/settings");
}

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
