"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getJobAction, startJobAction, type JobSnapshot } from "../../app/actions/jobs";
import type { NetworkProfile } from "../../lib/network/lan";
import type { TargetAccess } from "../../lib/jobs/types";
import { JobLog } from "../jobs/JobLog";

type StartDialogProps = {
  slug: string;
  open: boolean;
  onClose: () => void;
  networkProfile: NetworkProfile;
  dockerOk: boolean;
};

export function StartDialog({ slug, open, onClose, networkProfile, dockerOk }: StartDialogProps) {
  const router = useRouter();
  const [access, setAccess] = useState<TargetAccess>("machine");
  const [jobId, setJobId] = useState<number | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setJobId(null);
      setJob(null);
      setError(null);
      setAccess("machine");
    }
  }, [open]);

  useEffect(() => {
    if (jobId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const snapshot = await getJobAction(jobId);
      if (cancelled) return;
      if (snapshot) {
        setJob(snapshot);
        if (snapshot.status === "queued" || snapshot.status === "running") {
          timer = setTimeout(() => {
            void tick();
          }, 1000);
          return;
        }
        router.refresh();
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  if (!open) return null;

  const running = job?.status === "queued" || job?.status === "running";

  async function confirm() {
    setError(null);
    const result = await startJobAction(slug, access);
    if (!result.ok) {
      setError(result.reason === "busy" ? "Уже выполняется задача" : "Проект не найден");
      return;
    }
    setJobId(result.jobId);
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-dialog-title">
      <div className="dialog">
        <h2 id="start-dialog-title">Запуск</h2>
        <div className="choice-row">
          <button
            type="button"
            className={access === "machine" ? "selected" : undefined}
            onClick={() => setAccess("machine")}
            disabled={jobId != null}
          >
            Только эта машина
          </button>
          <button
            type="button"
            className={access === "lan" ? "selected" : undefined}
            onClick={() => setAccess("lan")}
            disabled={jobId != null}
          >
            Локальная сеть
          </button>
        </div>
        {networkProfile === "Public" ? (
          <p className="warn">Сеть помечена как Public: правило private может не сработать</p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {job ? <JobLog lines={job.logs} /> : null}
        {job?.errorSummary ? <p className="error">{job.errorSummary}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" disabled={!dockerOk || jobId != null || running} onClick={() => void confirm()}>
            Запустить
          </button>
        </div>
      </div>
    </div>
  );
}
