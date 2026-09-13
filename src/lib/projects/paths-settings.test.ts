import test from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "../test/temp-db";
import { getScanRoots, setScanRoots } from "./paths-settings";

test("scan roots default and persist", () => {
  const { db, close } = withTempDb();
  try {
    const roots = getScanRoots(db);
    assert.ok(roots.length >= 1);
    setScanRoots(db, ["D:\\\\work"]);
    assert.deepEqual(getScanRoots(db), ["D:\\\\work"]);
  } finally {
    close();
  }
});
