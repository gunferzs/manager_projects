"use client";

import { useFormState } from "react-dom";

type FormState = { error?: string } | null;

type KeyFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  confirm?: boolean;
  submitLabel: string;
};

export function KeyForm({ action, confirm = false, submitLabel }: KeyFormProps) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction}>
      <label>
        Ключ
        <input name="key" type="password" autoComplete={confirm ? "new-password" : "current-password"} required />
      </label>
      {confirm ? (
        <label>
          Повтор ключа
          <input name="confirm" type="password" autoComplete="new-password" required />
        </label>
      ) : null}
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
