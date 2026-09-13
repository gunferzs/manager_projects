import { CHALLENGE_TTL_MS, CONFIGURED_COOKIE_MAX_AGE_S, SESSION_TTL_MS } from "./types";

export const COOKIE_SESSION = "mgr_session";
export const COOKIE_CHALLENGE = "mgr_challenge";
export const COOKIE_CONFIGURED = "mgr_configured";

export type CookieOptions = {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
};

export function sessionCookieOptions(https: boolean): CookieOptions {
  return {
    name: COOKIE_SESSION,
    httpOnly: true,
    secure: https,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function challengeCookieOptions(https: boolean): CookieOptions {
  return {
    name: COOKIE_CHALLENGE,
    httpOnly: true,
    secure: https,
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  };
}

export function configuredCookieOptions(https: boolean): CookieOptions {
  return {
    name: COOKIE_CONFIGURED,
    httpOnly: true,
    secure: https,
    sameSite: "strict",
    path: "/",
    maxAge: CONFIGURED_COOKIE_MAX_AGE_S,
  };
}
