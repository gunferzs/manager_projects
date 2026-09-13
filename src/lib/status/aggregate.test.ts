import test from "node:test";
import assert from "node:assert/strict";
import { aggregateStatus } from "./aggregate";

test("stopped when no containers", () => {
  assert.equal(
    aggregateStatus({ containers: [], primaries: [], probes: [] }),
    "stopped",
  );
});

test("stopped when none running", () => {
  assert.equal(
    aggregateStatus({
      containers: [
        { name: "web", running: false, health: "none", binds: [] },
      ],
      primaries: [{ name: "web", healthKind: "http" }],
      probes: [{ serviceName: "web", ok: false }],
    }),
    "stopped",
  );
});

test("running when all non-none primaries pass probes", () => {
  assert.equal(
    aggregateStatus({
      containers: [
        { name: "web", running: true, health: "none", binds: [] },
        { name: "api", running: true, health: "none", binds: [] },
      ],
      primaries: [
        { name: "web", healthKind: "http" },
        { name: "api", healthKind: "tcp" },
      ],
      probes: [
        { serviceName: "web", ok: true },
        { serviceName: "api", ok: true },
      ],
    }),
    "running",
  );
});

test("running when docker primary is healthy or none", () => {
  assert.equal(
    aggregateStatus({
      containers: [{ name: "api", running: true, health: "healthy", binds: [] }],
      primaries: [{ name: "api", healthKind: "docker" }],
      probes: [],
    }),
    "running",
  );
  assert.equal(
    aggregateStatus({
      containers: [{ name: "api", running: true, health: "none", binds: [] }],
      primaries: [{ name: "api", healthKind: "docker" }],
      probes: [],
    }),
    "running",
  );
});

test("running when only none-kind primaries are running", () => {
  assert.equal(
    aggregateStatus({
      containers: [{ name: "worker", running: true, health: "none", binds: [] }],
      primaries: [{ name: "worker", healthKind: "none" }],
      probes: [{ serviceName: "worker", ok: null }],
    }),
    "running",
  );
});

test("unhealthy when a primary probe is false", () => {
  assert.equal(
    aggregateStatus({
      containers: [{ name: "web", running: true, health: "none", binds: [] }],
      primaries: [{ name: "web", healthKind: "http" }],
      probes: [{ serviceName: "web", ok: false }],
    }),
    "unhealthy",
  );
});

test("unhealthy when docker primary is unhealthy", () => {
  assert.equal(
    aggregateStatus({
      containers: [
        { name: "api", running: true, health: "unhealthy", binds: [] },
      ],
      primaries: [{ name: "api", healthKind: "docker" }],
      probes: [],
    }),
    "unhealthy",
  );
});

test("degraded when probe is still null", () => {
  assert.equal(
    aggregateStatus({
      containers: [{ name: "web", running: true, health: "none", binds: [] }],
      primaries: [{ name: "web", healthKind: "http" }],
      probes: [{ serviceName: "web", ok: null }],
    }),
    "degraded",
  );
});

test("degraded when mix of ok and pending probes", () => {
  assert.equal(
    aggregateStatus({
      containers: [
        { name: "web", running: true, health: "none", binds: [] },
        { name: "api", running: true, health: "none", binds: [] },
      ],
      primaries: [
        { name: "web", healthKind: "http" },
        { name: "api", healthKind: "http" },
      ],
      probes: [
        { serviceName: "web", ok: true },
        { serviceName: "api", ok: null },
      ],
    }),
    "degraded",
  );
});
