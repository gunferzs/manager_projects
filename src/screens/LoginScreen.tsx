import { KeyForm } from "../components/auth/KeyForm";
import { loginAction } from "../app/actions/auth";

export function LoginScreen() {
  return (
    <main>
      <h1>Вход</h1>
      <KeyForm action={loginAction} submitLabel="Войти" />
    </main>
  );
}
