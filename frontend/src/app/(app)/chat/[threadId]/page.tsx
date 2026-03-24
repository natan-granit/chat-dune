export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-[var(--cd-text-secondary)]">
        Chat Thread Page Coming Soon — thread: {threadId}
      </p>
    </div>
  );
}
