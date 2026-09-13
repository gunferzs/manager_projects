"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readClientIp } from "../../lib/auth/client-ip";
import {
  COOKIE_CHALLENGE,
  COOKIE_SESSION,
  challengeCookieOptions,
  configuredCookieOptions,
  sessionCookieOptions,
} from "../../lib/auth/cookies";
import { formatLockMessage, INVALID_DATA_MESSAGE } from "../../lib/auth/messages";
import { submitKey } from "../../lib/auth/login";
import { createSetup } from "../../lib/auth/setup";
import { validateSetupFields } from "../../lib/auth/setup-form";
import { verifyTotp } from "../../lib/auth/totp";
import { getRuntimeDb } from "../../lib/db/client";

export type AuthFormState = { error?: string } | null;

function isHttps(): boolean {
  return headers().get("x-forwarded-proto") === "https";
}

function requestIp(): string {
  const h = headers();
  return (
    readClientIp({
      remoteAddress: h.get("x-real-ip") ?? "127.0.0.1",
      forwardedFor: h.get("x-forwarded-for") ?? undefined,
    }) || "127.0.0.1"
  );
}

function setSessionCookie(token: string): void {
  const opts = sessionCookieOptions(isHttps());
  cookies().set({ ...opts, value: token });
}

function setChallengeCookie(token: string): void {
  const opts = challengeCookieOptions(isHttps());
  cookies().set({ ...opts, value: token });
}

function setConfiguredCookie(): void {
  const opts = configuredCookieOptions(isHttps());
  cookies().set({ ...opts, value: "1" });
}

function clearAuthCookies(): void {
  const https = isHttps();
  cookies().set({ ...sessionCookieOptions(https), name: COOKIE_SESSION, value: "", maxAge: 0 });
  cookies().set({ ...challengeCookieOptions(https), name: COOKIE_CHALLENGE, value: "", maxAge: 0 });
}

export async function setupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateSetupFields(
    String(formData.get("key") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (!parsed.ok) {
    return { error: parsed.message };
  }

  try {
    const { token } = await createSetup(getRuntimeDb(), parsed.key);
    setSessionCookie(token);
    setConfiguredCookie();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ALREADY_SETUP") {
      redirect("/login");
    }
    throw error;
  }

  redirect("/");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const key = String(formData.get("key") ?? "");
  const result = await submitKey(getRuntimeDb(), key, requestIp());

  if (result.kind === "invalid") {
    return { error: INVALID_DATA_MESSAGE };
  }
  if (result.kind === "locked") {
    return { error: formatLockMessage(result.until) };
  }
  if (result.kind === "challenge") {
    setChallengeCookie(result.token);
    setConfiguredCookie();
    redirect("/login/totp");
  }

  setSessionCookie(result.token);
  setConfiguredCookie();
  redirect("/");
}

export async function totpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const challengeToken = cookies().get(COOKIE_CHALLENGE)?.value;
  if (!challengeToken) {
    redirect("/login");
  }

  const result = await verifyTotp(
    getRuntimeDb(),
    challengeToken,
    String(formData.get("code") ?? ""),
    requestIp(),
  );

  if (result.kind === "expired") {
    clearAuthCookies();
    redirect("/login");
  }
  if (result.kind === "invalid" || result.kind === "ip_mismatch") {
    return { error: INVALID_DATA_MESSAGE };
  }

  cookies().set({ ...challengeCookieOptions(isHttps()), name: COOKIE_CHALLENGE, value: "", maxAge: 0 });
  setSessionCookie(result.token);
  setConfiguredCookie();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  clearAuthCookies();
  redirect("/login");
}
