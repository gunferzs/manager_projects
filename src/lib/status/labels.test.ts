import assert from "node:assert/strict";
import { test } from "node:test";
import { accessLabel, localOpenUrl, openUrl, shareUrl, statusLabel } from "./labels";

test("labels and open urls", () => {
  assert.equal(statusLabel("running"), "работает");
  assert.equal(accessLabel("lan_unconfirmed"), "локалка без фаервола");
  assert.equal(openUrl("lan", "192.168.1.89", 3000), "http://127.0.0.1:3000");
  assert.equal(openUrl("machine", "192.168.1.89", 3000), "http://127.0.0.1:3000");
  assert.equal(localOpenUrl(3000), "http://127.0.0.1:3000");
  assert.equal(shareUrl("lan", "192.168.1.89", 3000), "http://192.168.1.89:3000");
  assert.equal(shareUrl("machine", "192.168.1.89", 3000), null);
});

test("status and access maps and lan fallback", () => {
  assert.equal(statusLabel("degraded"), "деградировал");
  assert.equal(statusLabel("unhealthy"), "нездоров");
  assert.equal(statusLabel("stopped"), "не запущен");
  assert.equal(accessLabel("machine"), "только машина");
  assert.equal(accessLabel("lan"), "локалка");
  assert.equal(accessLabel("none"), "");
  assert.equal(shareUrl("lan_unconfirmed", "10.0.0.4", 8080), "http://10.0.0.4:8080");
  assert.equal(shareUrl("lan", null, 3000), null);
  assert.equal(openUrl("lan", null, 3000), "http://127.0.0.1:3000");
});
