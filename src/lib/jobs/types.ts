import type { ContainerFact } from "../status/aggregate";
import type { ProjectRow } from "../projects/types";

export type JobType = "start" | "stop" | "restart" | "scan";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type TargetAccess = "machine" | "lan";

export type JobLogStream = "stdout" | "stderr" | "system";

export type EnqueueInput = {
  projectId: number;
  type: JobType;
  targetAccess: TargetAccess | null;
};

export type EnqueueResult = { ok: true; jobId: number } | { ok: false; reason: "busy" };

export type PortInspect = { port: number; kind: "tcp"; owner: string };

export type ComposePortRemap = {
  service: string;
  hostPort: number;
  containerPort: number;
};

export type ComposeUpOptions = {
  publicHost?: string;
};

export type JobDeps = {
  composeUp(
    project: ProjectRow,
    access: TargetAccess,
    remaps?: ComposePortRemap[],
    options?: ComposeUpOptions,
  ): AsyncIterable<string>;
  composeStop(project: ProjectRow): AsyncIterable<string>;
  listPorts(): Promise<PortInspect[]>;
  listContainers?(): Promise<ContainerFact[]>;
  firewallAllow?(ports: number[]): Promise<{ ok: true } | { ok: false; message: string }>;
  firewallRevoke?(prefix: string): Promise<void>;
  resolvePublicHost?(access: TargetAccess): Promise<string>;
};

export type JobRow = {
  id: number;
  project_id: number;
  type: JobType;
  target_access: TargetAccess | null;
  status: JobStatus;
  error_summary: string | null;
  started_at: string | null;
  finished_at: string | null;
};
