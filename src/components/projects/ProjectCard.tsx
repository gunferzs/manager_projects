"use client";

import { useState } from "react";
import Link from "next/link";
import type { NetworkProfile } from "../../lib/network/lan";
import type { ProjectCardModel } from "../../lib/projects/present";
import { openUrl } from "../../lib/status/labels";
import { AccessChip } from "./AccessChip";
import { ProjectPhoto } from "./ProjectPhoto";
import { StartDialog } from "./StartDialog";
import { StatusChip } from "./StatusChip";

type ProjectCardProps = {
  project: ProjectCardModel;
  lanIp: string | null;
  dockerOk: boolean;
  networkProfile: NetworkProfile;
};

export function ProjectCard({ project, lanIp, dockerOk, networkProfile }: ProjectCardProps) {
  const [startOpen, setStartOpen] = useState(false);
  const canOpen =
    project.status !== "stopped" && project.hasUi && project.uiPort != null;
  const href = canOpen && project.uiPort != null ? openUrl(project.access, lanIp, project.uiPort) : null;
  const startDisabled = !dockerOk || project.busy || !project.hasCompose;

  return (
    <article className="project-card">
      <Link href={`/projects/${project.slug}`} className="card-main">
        <ProjectPhoto imagePath={project.imagePath} name={project.name} />
        <div>
          <h2>{project.name}</h2>
          <div className="chip-row">
            <StatusChip status={project.status} />
            {project.hasCompose ? (
              <AccessChip level={project.access} />
            ) : (
              <span className="chip chip-muted">нет Docker</span>
            )}
          </div>
          <p className="ports">{project.ports.length > 0 ? project.ports.join(", ") : "порты не заданы"}</p>
        </div>
      </Link>
      <div className="card-actions">
        {project.hasCompose && project.status === "stopped" ? (
          <button type="button" disabled={startDisabled} onClick={() => setStartOpen(true)}>
            Запустить
          </button>
        ) : null}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            Открыть
          </a>
        ) : null}
      </div>
      <StartDialog
        slug={project.slug}
        open={startOpen}
        onClose={() => setStartOpen(false)}
        networkProfile={networkProfile}
        dockerOk={dockerOk}
      />
    </article>
  );
}
