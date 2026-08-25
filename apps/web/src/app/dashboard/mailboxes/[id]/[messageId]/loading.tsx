// Matches the reading pane's shape so the layout doesn't jump when the real
// message replaces it.
export default function MessageDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 h-4 w-32 rounded bg-gray-200 md:hidden" />
      <div className="rounded-lg border bg-white">
        <div className="flex items-start justify-between border-b p-4">
          <div className="space-y-2">
            <div className="h-5 w-56 rounded bg-gray-200" />
            <div className="h-3 w-40 rounded bg-gray-100" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-8 w-16 rounded-lg bg-gray-200" />
            <div className="h-8 w-8 rounded-lg bg-gray-100" />
            <div className="h-8 w-20 rounded-lg bg-gray-100" />
            <div className="h-8 w-16 rounded-lg bg-gray-100" />
          </div>
        </div>
        <div className="p-4">
          <div className="h-[60vh] w-full rounded-lg border bg-gray-50" />
        </div>
      </div>
    </div>
  );
}
