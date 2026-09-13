import { redirect } from "next/navigation";
import { KeyForm } from "../components/auth/KeyForm";
import { setupAction } from "../app/actions/auth";
import { hasKey } from "../lib/auth/setup";
import { validateSetupFields } from "../lib/auth/setup-form";
import { getRuntimeDb } from "../lib/db/client";

export { validateSetupFields };

export async function SetupScreen() {
  if (hasKey(getRuntimeDb())) {
    redirect("/login");
  }

  return (
    <main>
      <h1>Настройка</h1>
      <KeyForm action={setupAction} confirm submitLabel="Сохранить ключ" />
    </main>
  );
}
