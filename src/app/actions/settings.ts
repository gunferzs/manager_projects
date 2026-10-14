"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readRequestIp } from "../../lib/auth/client-ip";
import { COOKIE_SESSION } from "../../lib/auth/cookies";
import { resolveIdentity } from "../../lib/auth/guard";
import { requireSessionForAction } from "../../lib/auth/require-action";
import { MASTER_KEY_MISSING_MESSAGE } from "../../lib/auth/messages";
import { changeKey, confirmPendingTotp, startTotpEnroll } from "../../lib/auth/settings";
import { validateSetupFields } from "../../lib/auth/setup-form";
import { getRuntimeDb } from "../../lib/db/client";
import { setScanRoots } from "../../lib/projects/paths-settings";

export type SettingsFormState = {
  error?: string;
  ok?: boolean;
  secret?: string;
  otpauthUrl?: string;
} | null;

function masterKey(): string | null {
  const key = process.env.MANAGER_MASTER_KEY?.trim();
  return key ? key : null;
}

function currentSession(): { token: string; sessionId?: number } {
  const token = cookies().get(COOKIE_SESSION)?.value;
  if (!token) {
    redirect("/login");
  }
  const identity = resolveIdentity(getRuntimeDb(), { session: token });
  return {
    token,
    sessionId: identity.kind === "session" ? identity.sessionId : undefined,
  };
}

export async function changeKeyAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSessionForAction();
  const parsed = validateSetupFields(
    String(formData.get("newKey") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (!parsed.ok) {
    return { error: parsed.message };
  }

  const key = masterKey();
  if (!key) {
    return { error: MASTER_KEY_MISSING_MESSAGE };
  }

  const session = currentSession();
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  const result = await changeKey(getRuntimeDb(), {
    oldKey: String(formData.get("oldKey") ?? ""),
    newKey: parsed.key,
    totpCode: totpCode || undefined,
    masterKey: key,
    keepSessionToken: session.token,
  });
  if (!result.ok) {
    return { error: result.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function enrollTotpStartAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSessionForAction();
  const key = masterKey();
  if (!key) {
    return { error: MASTER_KEY_MISSING_MESSAGE };
  }
  currentSession();
  const currentCode = String(formData.get("totpCode") ?? "").trim();
  const result = startTotpEnroll(getRuntimeDb(), key, currentCode || undefined);
  if (!result.ok) {
    return { error: result.message };
  }
  return { secret: result.secret, otpauthUrl: result.otpauthUrl };
}

export async function enrollTotpConfirmAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSessionForAction();
  const key = masterKey();
  if (!key) {
    return { error: MASTER_KEY_MISSING_MESSAGE };
  }
  const session = currentSession();
  const result = confirmPendingTotp(
    getRuntimeDb(),
    key,
    String(formData.get("code") ?? ""),
    readRequestIp(headers()),
    session.sessionId,
  );
  if (!result.ok) {
    return { error: result.message };
  }
  revalidatePath("/settings");
  revalidatePath("/");
  redirect("/settings");
}

export async function saveRootsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSessionForAction();
  const roots = String(formData.get("roots") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (roots.length === 0) {
    return { error: "Укажите хотя бы один путь" };
  }
  setScanRoots(getRuntimeDb(), roots);
  revalidatePath("/settings");
  return { ok: true };
}
