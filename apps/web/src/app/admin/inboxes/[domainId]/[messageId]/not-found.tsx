// Keeps a stale message link inside the reading pane instead of replacing the
// whole admin inbox with the root 404.
export default function AdminMessageNotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-xl border bg-white text-center">
      <p className="text-sm font-medium text-gray-700">This message is no longer here.</p>
      <p className="text-xs text-gray-400">It was deleted, or it belongs to another domain.</p>
    </div>
  );
}
