import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { probeHttp, probeTcp } from "./probes.ts";

test("probeHttp treats 307 as healthy without following redirect", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(307, { Location: "http://127.0.0.1:9/elsewhere" });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    assert.equal(await probeHttp(port, "/"), true);
  } finally {
    server.close();
  }
});

test("probeTcp succeeds on open port", async () => {
  const server = http.createServer((_req, res) => {
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    assert.equal(await probeTcp(port), true);
  } finally {
    server.close();
  }
});
