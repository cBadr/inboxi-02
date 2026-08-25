// Without this boundary, a message that was deleted in another tab drops the
// whole mailbox screen to the root 404 — a dead end on phones, where the list
// is not on screen to go back to.
export default function MessageNotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-lg border bg-white text-center">
      <p className="text-sm font-medium text-gray-700">This message is no longer here.</p>
      <p className="text-xs text-gray-400">It was deleted, or it belongs to another mailbox.</p>
    </div>
  );
}
