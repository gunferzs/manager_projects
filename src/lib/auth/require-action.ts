import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeDb } from "../db/client";
import { COOKIE_SESSION } from "./cookies";
import { resolveIdentity } from "./guard";
import { ensureValidSessionForPage } from "./require-session";

export async function requireSessionForAction(): Promise<void> {
  await ensureValidSessionForPage();
  const sessionToken = cookies().get(COOKIE_SESSION)?.value;
  const identity = resolveIdentity(getRuntimeDb(), { session: sessionToken });
  if (identity.kind !== "session") {
    redirect("/login");
  }
}
