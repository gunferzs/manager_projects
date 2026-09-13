import { ensureValidSessionForPage } from "../../lib/auth/require-session";
import { loadSettingsPageData } from "../../lib/auth/settings";
import { SettingsScreen } from "../../screens/SettingsScreen";

export default async function Page() {
  await ensureValidSessionForPage();
  const data = await loadSettingsPageData();
  return <SettingsScreen {...data} />;
}
