import test from "node:test";
import assert from "node:assert/strict";
import { validateSetupFields } from "./setup-form";

test("setup form messages", () => {
  assert.deepEqual(validateSetupFields("short", "short"), {
    ok: false,
    message: "Ключ не короче 16 символов",
  });
  assert.deepEqual(validateSetupFields("sixteen-chars-ok", "sixteen-chars-no"), {
    ok: false,
    message: "Ключи не совпадают",
  });
  assert.deepEqual(validateSetupFields("sixteen-chars-ok", "sixteen-chars-ok"), {
    ok: true,
    key: "sixteen-chars-ok",
  });
});
