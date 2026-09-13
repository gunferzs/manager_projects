"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getJobAction, restartJobAction, stopJobAction } from "../app/actions/jobs";
import { AppHeader } from "../components/layout/AppHeader";
import { JobLog } from "../components/jobs/JobLog";
import { AccessChip } from "../components/projects/AccessChip";
import { ProjectPhoto } from "../components/projects/ProjectPhoto";
import { ServiceTable } from "../components/projects/ServiceTable";
import { StartDialog } from "../components/projects/StartDialog";
import { StatusChip } from "../components/projects/StatusChip";
import type { DetailPageData, JobViewModel } from "../lib/projects/present";

export function ProjectDetailScreen({
  project,
  dockerOk,
  lanIp,
  totpEnabled,
  networkProfile,
}: DetailPageData) {
  const router = useRouter();
  const [startOpen, setStartOpen] = useState(false);
  const [job, setJob] = useState<JobViewModel | null>(project.lastJob);

  useEffect(() => {
    setJob(project.lastJob);
  }, [project.lastJob]);

  useEffect(() => {
    if (!job) return;
    const jobId = job.id;
    const jobType = job.type;
    if (job.status !== "queued" && job.status !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const snapshot = await getJobAction(jobId);
      if (cancelled || !snapshot) return;
      setJob({
        id: snapshot.id,
        type: jobType,
        status: snapshot.status,
        errorSummary: snapshot.errorSummary,
        logs: snapshot.logs,
      });
      if (snapshot.status === "queued" || snapshot.status === "running") {
        timer = setTimeout(() => {
          void tick();
        }, 1000);
        return;
      }
      router.refresh();
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [job?.id, job?.status, job?.type, router]);

  const controlsDisabled = !dockerOk || project.busy || !project.hasCompose;

  async function onStop() {
    if (!window.confirm("Остановить проект?")) return;
    const result = await stopJobAction(project.slug);
    if (result.ok) {
      setJob({
        id: result.jobId,
        type: "stop",
        status: "queued",
        errorSummary: null,
        logs: [],
      });
    }
  }

  async function onRestart() {
    if (project.status === "stopped") {
      setStartOpen(true);
      return;
    }
    const result = await restartJobAction(project.slug);
    if (result.ok) {
      setJob({
        id: result.jobId,
        type: "restart",
        status: "queued",
        errorSummary: null,
        logs: [],
      });
    }
  }

  return (
    <main className="wide">
      <AppHeader lanIp={lanIp} totpEnabled={totpEnabled} />
      <p>
        <Link href="/">К списку</Link>
      </p>
      <section className="detail-hero">
        <ProjectPhoto imagePath={project.imagePath} name={project.name} />
        <div>
          <h2>{project.name}</h2>
          <p>{project.description ?? "Нет описания"}</p>
          <div className="chip-row">
            <StatusChip status={project.status} />
            {project.hasCompose ? <AccessChip level={project.access} /> : <span className="chip chip-muted">нет Docker</span>}
          </div>
        </div>
      </section>
      {project.hasCompose ? (
        <div className="card-actions">
          <button
            type="button"
            disabled={controlsDisabled || project.status !== "stopped"}
            onClick={() => setStartOpen(true)}
          >
            Запустить
          </button>
          <button type="button" disabled={controlsDisabled || project.status === "stopped"} onClick={() => void onStop()}>
            Остановить
          </button>
          <button
            type="button"
            disabled={controlsDisabled || project.status === "stopped"}
            onClick={() => void onRestart()}
          >
            Перезапустить
          </button>
        </div>
      ) : (
        <p>Нет compose-файла — запуск недоступен.</p>
      )}
      <ServiceTable services={project.services} />
      <h3>Лог задачи</h3>
      <JobLog lines={job?.logs ?? []} />
      {job?.errorSummary ? <p className="error">{job.errorSummary}</p> : null}
      <StartDialog
        slug={project.slug}
        open={startOpen}
        onClose={() => setStartOpen(false)}
        networkProfile={networkProfile}
        dockerOk={dockerOk}
      />
    </main>
  );
}
