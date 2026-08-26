import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireUser } from '@/lib/session';
import { listUserFolders } from '@/lib/folders';
import { setForwarding } from '../../actions';
import { InboxList, type InboxMessage } from '@/components/InboxList';
import {
  setMessagesArchived,
  setMessagesRead,
  setMessagesStarred,
  deleteMessages,
  moveMessagesToFolder,
} from '../../inbox-actions';

export const dynamic = 'force-dynamic';

// The list and the reading pane live in one layout so the 300-message fetch
// only runs once per mailbox, not on every message click — the [messageId]
// route only ever renders the right-hand pane inside this shell.
export default async function MailboxLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) notFound();

  const folders = await listUserFolders(user.id);

  const rows = await prisma.message.findMany({
    where: { mailboxId: mailbox.id },
    orderBy: { receivedAt: 'desc' },
    take: 300,
    include: { mailbox: { select: { type: true } }, _count: { select: { attachments: true } } },
  });

  const messages: InboxMessage[] = rows.map((m) => ({
    id: m.id,
    fromAddress: m.fromAddress,
    toAddress: m.toAddress,
    subject: m.subject,
    snippet: m.snippet,
    receivedAt: m.receivedAt.toISOString(),
    isRead: m.isRead,
    isArchived: m.isArchived,
    isStarred: m.isStarred,
    isCatchAll: m.mailbox?.type === 'CATCH_ALL',
    attachments: m._count.attachments,
    folderId: m.folderId,
    otpCode:
      extractOtp({ subject: m.subject ?? undefined, text: m.textBody ?? undefined })?.code ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/mailboxes" className="text-sm text-gray-500 hover:text-brand">
          ← Mailboxes
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-mono text-xl font-bold text-gray-900">{mailbox.address}</h1>
          <Link href="/dashboard/folders" className="text-sm text-gray-500 hover:text-brand">
            Manage folders →
          </Link>
        </div>
      </div>

      <form
        action={setForwarding}
        className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm"
      >
        <input type="hidden" name="id" value={mailbox.id} />
        <span className="text-gray-500">Forward to:</span>
        <input
          name="forwardTo"
          type="email"
          defaultValue={mailbox.forwardTo ?? ''}
          placeholder="real@address.com (blank to disable)"
          className="w-64 rounded border px-2 py-1"
        />
        <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Save</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <InboxList
            scopeId={mailbox.id}
            basePath={`/dashboard/mailboxes/${mailbox.id}`}
            messages={messages}
            actions={{
              setArchived: setMessagesArchived,
              setRead: setMessagesRead,
              setStarred: setMessagesStarred,
              remove: deleteMessages,
            }}
            folders={folders}
            onMoveToFolder={moveMessagesToFolder}
          />
        </div>
        <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
