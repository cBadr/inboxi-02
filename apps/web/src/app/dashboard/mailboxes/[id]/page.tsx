// Data fetching and the list itself live in layout.tsx (shared across every
// message route); this route is only the placeholder shown before a message
// is picked, so it stays hidden on phones where the list already fills the
// screen.
export default function MailboxInboxPage() {
  return (
    <div className="hidden h-[calc(100vh-14rem)] items-center justify-center rounded-xl border bg-white text-sm text-gray-400 md:flex">
      Select a message to read it here
    </div>
  );
}
