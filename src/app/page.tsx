import { ensureValidSessionForPage } from "../lib/auth/require-session";

export default async function Page() {
  await ensureValidSessionForPage();
  return <p>скоро список</p>;
}
