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
import { applyScan } from "../../lib/projects/scan";

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
