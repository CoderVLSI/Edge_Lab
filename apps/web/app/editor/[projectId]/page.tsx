import { IdeLayout } from "../../../components/ide-layout";

export default async function EditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <IdeLayout projectId={projectId} />;
}
