"use client";

import { useFormState } from "react-dom";
import { changeKeyAction, type SettingsFormState } from "../../app/actions/settings";

export function ChangeKeyForm({ totpEnabled }: { totpEnabled: boolean }) {
  const [state, formAction] = useFormState(changeKeyAction, null as SettingsFormState);

  return (
    <form action={formAction}>
      <h3>Сменить ключ</h3>
      <label>
        Текущий ключ
        <input name="oldKey" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Новый ключ
        <input name="newKey" type="password" autoComplete="new-password" required />
      </label>
      <label>
        Повтор нового ключа
        <input name="confirm" type="password" autoComplete="new-password" required />
      </label>
      {totpEnabled ? (
        <label>
          Код TOTP
          <input
            name="totpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
      ) : null}
      {state?.error ? <p className="error">{state.error}</p> : null}
      {state?.ok ? <p>Ключ обновлён</p> : null}
      <button type="submit">Сменить ключ</button>
    </form>
  );
}
