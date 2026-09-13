import type Database from "better-sqlite3";
import { RULE_PREFIX } from "../firewall/names";
import { runFirewall } from "../firewall/client";
import { composeLs, listComposeContainers } from "../docker/cli";
import { getLastSuccessfulStartAccess, getLatestJob, listJobLogs } from "../jobs/queue";
import type { JobStatus, JobType, TargetAccess } from "../jobs/types";
import type { NetworkProfile } from "../network/lan";
import { getLanIpv4, getNetworkProfile } from "../network/lan";
import { resolveAccess, type AccessLevel } from "../status/access";
import { aggregateStatus, type ProjectStatus } from "../status/aggregate";
import { probeHttp, probeTcp } from "../status/probes";
import { isTotpEnabled } from "../auth/totp";
import { getRuntimeDb } from "../db/client";
import { getProjectBySlug, listProjects, listProjectServices } from "./repo";
import type { ProjectRow, ProjectServiceRow } from "./types";

export type ProjectCardModel = {
  slug: string;
  name: string;
  imagePath: string | null;
  status: ProjectStatus;
  access: AccessLevel;
  ports: number[];
  hasCompose: boolean;
  hasUi: boolean;
  uiPort: number | null;
  busy: boolean;
};

export type ServiceRowModel = {
  name: string;
  port: number | null;
  probeOk: boolean | null;
};

export type JobViewModel = {
  id: number;
  type: JobType;
  status: JobStatus;
  errorSummary: string | null;
  logs: Array<{ seq: number; stream: string; line: string }>;
};

export type ProjectDetailModel = {
  slug: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  status: ProjectStatus;
  access: AccessLevel;
  hasCompose: boolean;
  busy: boolean;
  lastStartAccess: TargetAccess | null;
  services: ServiceRowModel[];
  lastJob: JobViewModel | null;
};

export type ListPageData = {
  projects: ProjectCardModel[];
  dockerOk: boolean;
  lanIp: string | null;
  totpEnabled: boolean;
  networkProfile: NetworkProfile;
};

export type DetailPageData = {
  project: ProjectDetailModel;
  dockerOk: boolean;
  lanIp: string | null;
  totpEnabled: boolean;
  networkProfile: NetworkProfile;
};

export function firewallPortsForSlug(names: string[], slug: string): number[] {
  const prefix = `${RULE_PREFIX}${slug}-`;
  return names.flatMap((name) => {
    if (!name.startsWith(prefix)) return [];
    const rest = name.slice(prefix.length);
    if (!/^\d+$/.test(rest)) return [];
    return [Number(rest)];
  });
}

function isBusyJob(job: { type: JobType; status: JobStatus } | undefined): boolean {
  if (!job) return false;
  const lifecycle = job.type === "start" || job.type === "stop" || job.type === "restart";
  return lifecycle && (job.status === "queued" || job.status === "running");
}

async function probeServices(services: ProjectServiceRow[], hasRunning: boolean) {
  if (!hasRunning) {
    return services.map((service) => ({ serviceName: service.name, ok: null as boolean | null }));
  }
  return Promise.all(
    services.map(async (service) => {
      if (service.health_kind === "http" && service.host_port != null) {
        return { serviceName: service.name, ok: await probeHttp(service.host_port, service.health_path ?? "/health") };
      }
      if (service.health_kind === "tcp" && service.host_port != null) {
        return { serviceName: service.name, ok: await probeTcp(service.host_port) };
      }
      return { serviceName: service.name, ok: null as boolean | null };
    }),
  );
}

async function liveFacts(db: Database.Database, row: ProjectRow, dockerOk: boolean, firewallNames: string[]) {
  const services = listProjectServices(db, row.id);
  const hasCompose = Boolean(row.compose_file);
  const containers = hasCompose && dockerOk ? await listComposeContainers(row) : [];
  const hasRunning = containers.some((container) => container.running);
  const probes = await probeServices(services, hasRunning);
  const status = aggregateStatus({
    containers,
    primaries: services
      .filter((service) => service.is_primary === 1)
      .map((service) => ({ name: service.name, healthKind: service.health_kind })),
    probes,
  });
  const access = resolveAccess({
    status,
    binds: containers.flatMap((container) => container.binds),
    firewallPorts: firewallPortsForSlug(firewallNames, row.slug),
  });
  const latest = getLatestJob(db, row.id);
  return { services, hasCompose, probes, status, access, busy: isBusyJob(latest), latest };
}

function toJobView(db: Database.Database, job: NonNullable<ReturnType<typeof getLatestJob>>): JobViewModel {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    errorSummary: job.error_summary,
    logs: listJobLogs(db, job.id),
  };
}

export async function loadListPageData(): Promise<ListPageData> {
  const db = getRuntimeDb();
  const [ls, lanIp, networkProfile, fw] = await Promise.all([
    composeLs(),
    getLanIpv4(),
    getNetworkProfile(),
    runFirewall({ action: "list", prefix: RULE_PREFIX }),
  ]);
  const dockerOk = ls.ok;
  const firewallNames = fw.ok ? (fw.names ?? []) : [];
  const projects = await Promise.all(
    listProjects(db).map(async (row) => {
      const live = await liveFacts(db, row, dockerOk, firewallNames);
      const ui =
        live.services.find((service) => service.is_ui === 1 && service.host_port != null) ??
        live.services.find((service) => service.is_primary === 1 && service.host_port != null);
      return {
        slug: row.slug,
        name: row.name,
        imagePath: row.image_path,
        status: live.status,
        access: live.access,
        ports: live.services
          .map((service) => service.host_port)
          .filter((port): port is number => port != null),
        hasCompose: live.hasCompose,
        hasUi: live.services.some((service) => service.is_ui === 1),
        uiPort: ui?.host_port ?? null,
        busy: live.busy,
      } satisfies ProjectCardModel;
    }),
  );
  return {
    projects,
    dockerOk,
    lanIp,
    totpEnabled: isTotpEnabled(db),
    networkProfile,
  };
}

export async function loadDetailPageData(slug: string): Promise<DetailPageData | null> {
  const db = getRuntimeDb();
  const row = getProjectBySlug(db, slug);
  if (!row) return null;
  const [ls, lanIp, networkProfile, fw] = await Promise.all([
    composeLs(),
    getLanIpv4(),
    getNetworkProfile(),
    runFirewall({ action: "list", prefix: RULE_PREFIX }),
  ]);
  const dockerOk = ls.ok;
  const firewallNames = fw.ok ? (fw.names ?? []) : [];
  const live = await liveFacts(db, row, dockerOk, firewallNames);
  return {
    dockerOk,
    lanIp,
    totpEnabled: isTotpEnabled(db),
    networkProfile,
    project: {
      slug: row.slug,
      name: row.name,
      description: row.description,
      imagePath: row.image_path,
      status: live.status,
      access: live.access,
      hasCompose: live.hasCompose,
      busy: live.busy,
      lastStartAccess: getLastSuccessfulStartAccess(db, row.id),
      services: live.services.map((service) => ({
        name: service.name,
        port: service.host_port,
        probeOk: live.probes.find((probe) => probe.serviceName === service.name)?.ok ?? null,
      })),
      lastJob: live.latest ? toJobView(db, live.latest) : null,
    },
  };
}
