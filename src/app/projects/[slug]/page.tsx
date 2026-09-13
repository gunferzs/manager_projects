import { notFound } from "next/navigation";
import { ensureValidSessionForPage } from "../../../lib/auth/require-session";
import { loadDetailPageData } from "../../../lib/projects/present";
import { ProjectDetailScreen } from "../../../screens/ProjectDetailScreen";

export default async function Page({ params }: { params: { slug: string } }) {
  await ensureValidSessionForPage();
  const data = await loadDetailPageData(params.slug);
  if (!data) {
    notFound();
  }
  return <ProjectDetailScreen {...data} />;
}
