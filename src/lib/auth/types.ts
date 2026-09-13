export type SubmitKeyResult =
  | { kind: "session"; token: string }
  | { kind: "challenge"; token: string }
  | { kind: "invalid" }
  | { kind: "locked"; until: Date };

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const CONFIGURED_COOKIE_MAX_AGE_S = 10 * 365 * 24 * 60 * 60;
export const KEY_LOCK_AFTER = 8;
export const KEY_LOCK_MS = 15 * 60 * 1000;
