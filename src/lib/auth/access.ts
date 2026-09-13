export type GuardIdentity =
  | { kind: "anon" }
  | { kind: "challenge" }
  | { kind: "session"; sessionId: number };

function isStaticAsset(pathname: string): boolean {
  return pathname.startsWith("/_next") || pathname.includes("favicon");
}

export function isPublicPath(pathname: string, hasKeyConfigured: boolean): boolean {
  if (isStaticAsset(pathname)) {
    return true;
  }
  if (pathname === "/login") {
    return true;
  }
  if (pathname === "/setup" && !hasKeyConfigured) {
    return true;
  }
  return false;
}

export function canAccessPath(
  identity: GuardIdentity,
  pathname: string,
  hasKeyConfigured: boolean,
): boolean {
  if (isStaticAsset(pathname)) {
    return true;
  }

  if (pathname === "/login") {
    return true;
  }

  if (pathname === "/setup") {
    if (identity.kind === "session") {
      return false;
    }
    return !hasKeyConfigured;
  }

  if (pathname === "/login/totp") {
    return identity.kind === "challenge";
  }

  if (identity.kind === "session") {
    if (pathname === "/") {
      return true;
    }
    if (pathname.startsWith("/projects/")) {
      return true;
    }
    if (pathname === "/settings") {
      return true;
    }
  }

  return false;
}

export function identityFromCookies(cookies: { session?: string; challenge?: string }): GuardIdentity {
  if (cookies.session) {
    return { kind: "session", sessionId: 0 };
  }
  if (cookies.challenge) {
    return { kind: "challenge" };
  }
  return { kind: "anon" };
}

export function deniedRedirectPath(
  identity: GuardIdentity,
  pathname: string,
  hasKeyConfigured: boolean,
): string | null {
  if (canAccessPath(identity, pathname, hasKeyConfigured)) {
    return null;
  }
  if (identity.kind === "session") {
    return "/";
  }
  return hasKeyConfigured ? "/login" : "/setup";
}
