"use client";

import { useFormState } from "react-dom";
import { scanAction } from "../../app/actions/projects";
import { saveRootsAction, type SettingsFormState } from "../../app/actions/settings";

export function ScanRootsForm({ roots }: { roots: string[] }) {
  const [state, formAction] = useFormState(saveRootsAction, null as SettingsFormState);

  return (
    <div>
      <form action={formAction}>
        <label>
          Пути скана
          <textarea name="roots" rows={4} defaultValue={roots.join("\n")} />
        </label>
        {state?.error ? <p className="error">{state.error}</p> : null}
        {state?.ok ? <p>Пути сохранены</p> : null}
        <button type="submit">Сохранить пути</button>
      </form>
      <form action={scanAction} className="inline-form">
        <button type="submit">Найти проекты на машине</button>
      </form>
    </div>
  );
}
