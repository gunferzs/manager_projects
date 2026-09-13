"use client";

import { useFormState } from "react-dom";
import { enrollTotpConfirmAction, enrollTotpStartAction, type SettingsFormState } from "../../app/actions/settings";

export function TotpEnrollForm({ totpEnabled }: { totpEnabled: boolean }) {
  const [startState, startAction] = useFormState(enrollTotpStartAction, null as SettingsFormState);
  const [confirmState, confirmAction] = useFormState(enrollTotpConfirmAction, null as SettingsFormState);

  return (
    <div>
      <h3>{totpEnabled ? "Перевыпустить TOTP" : "Включить TOTP"}</h3>
      <form action={startAction}>
        {totpEnabled ? (
          <label>
            Текущий код
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
        <button type="submit">{totpEnabled ? "Показать новый секрет" : "Показать секрет"}</button>
      </form>
      {startState?.error ? <p className="error">{startState.error}</p> : null}
      {startState?.secret && startState.otpauthUrl ? (
        <div className="secret-box">
          <p>Секрет (один раз): {startState.secret}</p>
          <p>otpauth: {startState.otpauthUrl}</p>
          <form action={confirmAction}>
            <label>
              Код из приложения
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
            {confirmState?.error ? <p className="error">{confirmState.error}</p> : null}
            <button type="submit">Подтвердить TOTP</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
