export type ContainerFact = {
  name: string;
  running: boolean;
  health: "healthy" | "unhealthy" | "none";
  binds: Array<{ port: number; address: string }>;
};

export type ProbeResult = {
  serviceName: string;
  ok: boolean | null;
};

export type ProjectStatus = "running" | "degraded" | "unhealthy" | "stopped";

type Primary = { name: string; healthKind: "http" | "tcp" | "docker" | "none" };

type PrimaryOutcome = "ok" | "fail" | "unknown";

function evaluatePrimary(
  primary: Primary,
  container: ContainerFact | undefined,
  probe: ProbeResult | undefined,
): PrimaryOutcome {
  if (primary.healthKind === "none") {
    return "ok";
  }

  if (primary.healthKind === "docker") {
    if (!container?.running) {
      return "fail";
    }
    if (container.health === "unhealthy") {
      return "fail";
    }
    if (container.health === "healthy" || container.health === "none") {
      return "ok";
    }
    return "unknown";
  }

  if (probe?.ok === true) {
    return "ok";
  }
  if (probe?.ok === false) {
    return "fail";
  }
  return "unknown";
}

export function aggregateStatus(input: {
  containers: ContainerFact[];
  primaries: Primary[];
  probes: ProbeResult[];
}): ProjectStatus {
  const { containers, primaries, probes } = input;

  if (containers.length === 0) {
    return "stopped";
  }

  const hasRunning = containers.some((container) => container.running);
  if (!hasRunning) {
    return "stopped";
  }

  const containerByName = new Map(containers.map((c) => [c.name, c]));
  const probeByName = new Map(probes.map((p) => [p.serviceName, p]));

  const checkedPrimaries = primaries.filter((p) => p.healthKind !== "none");
  if (checkedPrimaries.length === 0) {
    return "running";
  }

  const outcomes = checkedPrimaries.map((primary) =>
    evaluatePrimary(
      primary,
      containerByName.get(primary.name),
      probeByName.get(primary.name),
    ),
  );

  if (outcomes.some((outcome) => outcome === "fail")) {
    return "unhealthy";
  }
  if (outcomes.every((outcome) => outcome === "ok")) {
    return "running";
  }
  return "degraded";
}
