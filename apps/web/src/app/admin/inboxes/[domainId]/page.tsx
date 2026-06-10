import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';
import { getConnectionInfo } from '@/lib/mail-connection';
import { AdminComposer } from '@/components/admin/AdminComposer';
import { ConnectionInfo } from '@/components/admin/ConnectionInfo';
import { InboxList, type InboxMessage } from '@/components/InboxList';
import {
  setMessagesArchived,
  setMessagesRead,
  setMessagesStarred,
  deleteMessages,
} from '@/app/admin/inbox-actions';

export const dynamic = 'force-dynamic';

export default async function AdminDomainInboxPage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  await requireAdmin();
  const { domainId } = await params;

  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) notFound();

  const [rows, unread, connection] = await Promise.all([
    prisma.message.findMany({
      where: { domainId },
      orderBy: { receivedAt: 'desc' },
      take: 300,
      include: {
        mailbox: { select: { type: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.message.count({ where: { domainId, isRead: false, isArchived: false } }),
    getConnectionInfo(domain.name),
  ]);

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
    <div className="space-y-5">
      {/* header */}
      <div>
        <Link href="/admin/inboxes" className="text-sm text-gray-500 transition hover:text-brand">
          ← Mailboxes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-xl font-bold text-gray-900">{domain.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              <span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
              {unread > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {unread} unread
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${domain.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {domain.isActive ? 'active' : 'inactive'}
              </span>
            </div>
          </div>
          <AdminComposer
            domains={[domain.name]}
            defaultDomain={domain.name}
            triggerLabel="Compose"
          />
        </div>
      </div>

      {/* connection + limits */}
      <ConnectionInfo info={connection} />

      {/* messages — searchable, selectable, archivable; opens in a new tab */}
      <InboxList
        scopeId={domainId}
        basePath={`/admin/inboxes/${domainId}`}
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
