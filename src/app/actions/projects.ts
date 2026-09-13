"use server";

import { revalidatePath } from "next/cache";
import { composeLs } from "../../lib/docker/cli";
import { requireSessionForAction } from "../../lib/auth/require-action";
import { getRuntimeDb } from "../../lib/db/client";
import { applyScan } from "../../lib/projects/scan";

export async function scanAction(): Promise<void> {
  await requireSessionForAction();
  const listed = await composeLs();
  if (listed.ok) {
    applyScan(getRuntimeDb(), listed.items);
  }
  revalidatePath("/");
  revalidatePath("/projects", "layout");
}
