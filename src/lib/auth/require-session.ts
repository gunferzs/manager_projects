import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSION, sessionCookieOptions } from "./cookies";
import { resolveIdentity } from "./guard";
import { getRuntimeDb } from "../db/client";

function isHttps(): boolean {
  return headers().get("x-forwarded-proto") === "https";
}

export async function ensureValidSessionForPage(): Promise<void> {
  const sessionToken = cookies().get(COOKIE_SESSION)?.value;
  if (!sessionToken) {
    return;
  }

  const identity = resolveIdentity(getRuntimeDb(), { session: sessionToken });
  if (identity.kind === "session") {
    return;
  }

  cookies().set({ ...sessionCookieOptions(isHttps()), name: COOKIE_SESSION, value: "", maxAge: 0 });
  redirect("/login");
}
