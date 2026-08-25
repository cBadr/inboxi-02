// The reading pane's default state before any message is selected. Hidden on
// mobile because InboxList takes over the full screen there until a message
// is opened.
export default function AdminDomainInboxEmptyState() {
  return (
    <div className="hidden h-[60vh] items-center justify-center rounded-xl border bg-white text-sm text-gray-400 md:flex">
      Select a message to read it here
    </div>
  );
}
