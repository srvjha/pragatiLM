import { NotebookWorkspace } from "@/components/layout/notebook-workspace";

/**
 * The notebook lives in the URL, so a reload keeps you where you were and the
 * back button behaves. Next 16 hands params in asynchronously.
 */
export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotebookWorkspace notebookId={id} />;
}
