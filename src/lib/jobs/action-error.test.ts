import test from "node:test";
import assert from "node:assert/strict";
import {
  deferBackgroundWork,
  invokeJobAction,
  isNextControlFlow,
  messageForActionFailure,
} from "./action-error";

test("maps failed to fetch to a russian reconnect hint", () => {
  assert.equal(
    messageForActionFailure(new TypeError("Failed to fetch")),
    "Связь с менеджером оборвалась. Обновите страницу и попробуйте снова.",
  );
});

test("maps unknown errors to a generic start failure", () => {
  assert.equal(messageForActionFailure(new Error("boom")), "Не удалось выполнить действие.");
});

test("treats NEXT_REDIRECT as control flow", () => {
  assert.equal(isNextControlFlow({ digest: "NEXT_REDIRECT;replace;/login;307;" }), true);
  assert.equal(isNextControlFlow(new Error("boom")), false);
});

test("invokeJobAction maps busy and swallows failed fetch", async () => {
  const busy = await invokeJobAction(async () => ({ ok: false, reason: "busy" }));
  assert.deepEqual(busy, { ok: false, message: "Уже выполняется задача" });

  const broken = await invokeJobAction(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(broken.ok, false);
  if (!broken.ok) {
    assert.match(broken.message, /оборвалась/);
  }
});

test("deferBackgroundWork does not start on the current turn", async () => {
  let started = false;
  deferBackgroundWork(async () => {
    started = true;
  });
  assert.equal(started, false);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(started, true);
});
