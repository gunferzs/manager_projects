import { TotpForm } from "../components/auth/TotpForm";
import { logoutAction, totpAction } from "../app/actions/auth";

export function TotpScreen() {
  return (
    <main>
      <h1>Подтверждение</h1>
      <TotpForm action={totpAction} />
      <form action={logoutAction}>
        <button type="submit">Назад</button>
      </form>
    </main>
  );
}
