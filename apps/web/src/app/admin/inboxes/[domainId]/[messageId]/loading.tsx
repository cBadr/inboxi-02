// Skeleton for the reading pane while a message loads, matching its layout so
// nothing jumps once the real content arrives.
export default function AdminMessageDetailLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 rounded-lg bg-gray-200" />
          <div className="h-8 w-20 rounded-lg bg-gray-200" />
          <div className="h-8 w-9 rounded-lg bg-gray-200" />
          <div className="h-8 w-9 rounded-lg bg-gray-200" />
          <div className="h-8 w-9 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-6 py-5">
          <div className="h-6 w-2/3 rounded bg-gray-200" />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200" />
              <div className="h-3 w-1/4 rounded bg-gray-200" />
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="h-[60vh] w-full rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
