"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkHostPortAction,
  savePrimaryPortAction,
  saveProjectComposeAction,
} from "../../app/actions/projects";

type Props = {
  slug: string;
  composeFile: string | null;
  composeCandidates: string[];
  primaryPort: number | null;
  primaryServiceName: string | null;
};

export function RuntimeSettingsForm({
  slug,
  composeFile,
  composeCandidates,
  primaryPort,
  primaryServiceName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composeError, setComposeError] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [portCheck, setPortCheck] = useState<string | null>(null);
  const [portValue, setPortValue] = useState(primaryPort != null ? String(primaryPort) : "");

  useEffect(() => {
    setPortValue(primaryPort != null ? String(primaryPort) : "");
  }, [primaryPort]);

  const canSaveCompose = composeCandidates.length > 0;

  return (
    <section className="runtime-settings">
      <h3>Настройки запуска</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await saveProjectComposeAction(slug, fd);
            setComposeError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          });
        }}
      >
        <label>
          Compose-файл
          {canSaveCompose ? (
            <select name="composeFile" defaultValue={composeFile ?? composeCandidates[0]} disabled={pending}>
              {composeCandidates.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          ) : (
            <p>{composeFile ?? "файл не найден"}</p>
          )}
        </label>
        {composeError ? <p className="error">{composeError}</p> : null}
        <button type="submit" disabled={!canSaveCompose || pending}>
          Сохранить compose
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await savePrimaryPortAction(slug, fd);
            setPortError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          });
        }}
      >
        <label>
          Основной порт{primaryServiceName ? ` (${primaryServiceName})` : ""}
          <input
            name="port"
            inputMode="numeric"
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            disabled={pending || primaryServiceName == null}
          />
        </label>
        {portError ? <p className="error">{portError}</p> : null}
        {portCheck ? <p>{portCheck}</p> : null}
        <button type="submit" disabled={pending || primaryServiceName == null}>
          Сохранить порт
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("port", portValue);
            startTransition(async () => {
              const res = await checkHostPortAction(fd);
              if (!res.ok) {
                setPortCheck(null);
                setPortError(res.error);
                return;
              }
              setPortError(null);
              setPortCheck(res.free ? "свободен" : `занят: ${res.owner}`);
            });
          }}
        >
          Проверить
        </button>
      </form>
    </section>
  );
}
