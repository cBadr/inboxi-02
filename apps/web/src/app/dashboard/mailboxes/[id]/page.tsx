import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireUser } from '@/lib/session';
import { setForwarding } from '../../actions';
import { InboxList, type InboxMessage } from '@/components/InboxList';
import {
  setMessagesArchived,
  setMessagesRead,
  setMessagesStarred,
  deleteMessages,
} from '../../inbox-actions';

export const dynamic = 'force-dynamic';

export default async function MailboxInboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) notFound();

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
    otpCode:
      extractOtp({ subject: m.subject ?? undefined, text: m.textBody ?? undefined })?.code ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/mailboxes" className="text-sm text-gray-500 hover:text-brand">
          ← Mailboxes
        </Link>
        <h1 className="mt-2 font-mono text-xl font-bold text-gray-900">{mailbox.address}</h1>
      </div>

      <form action={setForwarding} className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
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
      />
    </div>
  );
}
