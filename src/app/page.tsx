import { ensureValidSessionForPage } from "../lib/auth/require-session";
import { loadListPageData } from "../lib/projects/present";
import { ProjectListScreen } from "../screens/ProjectListScreen";

export default async function Page() {
  await ensureValidSessionForPage();
  const data = await loadListPageData();
  return <ProjectListScreen {...data} />;
}
