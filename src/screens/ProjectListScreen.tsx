"use client";

import { AppHeader } from "../components/layout/AppHeader";
import { ProjectCard } from "../components/projects/ProjectCard";
import { scanAction } from "../app/actions/projects";
import type { ListPageData } from "../lib/projects/present";

export function ProjectListScreen({
  projects,
  dockerOk,
  lanIp,
  totpEnabled,
  networkProfile,
}: ListPageData) {
  return (
    <main className="wide">
      <AppHeader lanIp={lanIp} totpEnabled={totpEnabled} />
      {!dockerOk ? <p className="banner-bad">Docker недоступен</p> : null}
      {projects.length === 0 ? (
        <form action={scanAction}>
          <p>Проекты ещё не найдены.</p>
          <button type="submit">Найти проекты на машине</button>
        </form>
      ) : (
        <>
          <form action={scanAction} className="inline-form">
            <button type="submit">Найти проекты на машине</button>
          </form>
          <section className="card-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                lanIp={lanIp}
                dockerOk={dockerOk}
                networkProfile={networkProfile}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
