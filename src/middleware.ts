import { NextResponse, type NextRequest } from "next/server";
import { deniedRedirectPath, hasKeyConfiguredFromCookie, identityFromCookies } from "./lib/auth/access";
import { COOKIE_CHALLENGE, COOKIE_CONFIGURED, COOKIE_SESSION } from "./lib/auth/cookies";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const identity = identityFromCookies({
    session: request.cookies.get(COOKIE_SESSION)?.value,
    challenge: request.cookies.get(COOKIE_CHALLENGE)?.value,
  });
  const hasKeyConfigured = hasKeyConfiguredFromCookie(request.cookies.get(COOKIE_CONFIGURED)?.value);
  const target = deniedRedirectPath(identity, pathname, hasKeyConfigured);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mgr-pathname", pathname);

  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
