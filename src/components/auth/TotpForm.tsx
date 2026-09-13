"use client";

import { useFormState } from "react-dom";

type FormState = { error?: string } | null;

type TotpFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

export function TotpForm({ action }: TotpFormProps) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction}>
      <label>
        Код
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
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button type="submit">Подтвердить</button>
    </form>
  );
}
