import test from "node:test";
import assert from "node:assert/strict";
import { INVALID_DATA_MESSAGE, formatLockMessage } from "./messages";

test("login and totp share one invalid message", () => {
  assert.equal(INVALID_DATA_MESSAGE, "Неверные данные");
});

test("lock message uses remaining minutes", () => {
  const now = new Date("2026-09-13T10:00:00Z");
  const until = new Date("2026-09-13T10:15:00Z");
  assert.equal(formatLockMessage(until, now), "Попробуйте через 15 минут");
});
