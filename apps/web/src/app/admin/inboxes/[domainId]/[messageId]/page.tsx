import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractCodes } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';
import { AdminComposer } from '@/components/admin/AdminComposer';
import { MessageCard } from '@/components/MessageCard';
import {
  archiveMessageAction,
  starMessageAction,
  deleteMessageAction,
} from '@/app/admin/inbox-actions';

export const dynamic = 'force-dynamic';

export default async function AdminMessageDetailPage({
  params,
}: {
  params: Promise<{ domainId: string; messageId: string }>;
}) {
  await requireAdmin();
  const { domainId, messageId } = await params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      attachments: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          storageKey: true,
        },
      },
      domain: { select: { name: true } },
    },
  });
  if (!message || message.domainId !== domainId) notFound();

  if (!message.isRead) {
    await prisma.message.update({ where: { id: message.id }, data: { isRead: true } });
  }

  const codes = extractCodes({
    subject: message.subject ?? undefined,
    text: message.textBody ?? undefined,
    html: message.htmlBody ?? undefined,
  }).map((c) => c.code);
  const domainName = message.domain.name;

  return (
    <div className="space-y-4">
      {/* The mobile back link is MessageCard's own; this is the desktop one,
          which names the domain because the list beside it already shows the
          messages. Two links to the same place on one screen is noise. */}
      <div className="hidden lg:block">
        <Link
          href={`/admin/inboxes/${domainId}`}
          className="text-sm text-gray-500 transition hover:text-brand"
        >
          ← {domainName}
        </Link>
      </div>

      <MessageCard
        subject={message.subject}
        fromAddress={message.fromAddress}
        toAddress={message.toAddress}
        receivedAt={message.receivedAt.toISOString()}
        sizeBytes={message.sizeBytes}
        isSpam={message.isSpam}
        html={message.htmlBody}
        text={message.textBody}
        codes={codes}
        attachments={message.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          hasContent: a.storageKey === 'db',
        }))}
        backHref={`/admin/inboxes/${domainId}`}
        backLabel={domainName}
        actions={
          <>
            <AdminComposer
              domains={[domainName]}
              defaultFrom={message.toAddress}
              defaultTo={message.fromAddress}
              defaultSubject={`Re: ${message.subject ?? ''}`}
              triggerLabel="Reply"
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
            />
            <AdminComposer
              domains={[domainName]}
              defaultFrom={message.toAddress}
              defaultSubject={`Fwd: ${message.subject ?? ''}`}
              triggerLabel="Forward"
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            />
            <form action={starMessageAction}>
              <input type="hidden" name="id" value={message.id} />
              <input type="hidden" name="domainId" value={domainId} />
              <input type="hidden" name="starred" value={String(!message.isStarred)} />
              <button
                title={message.isStarred ? 'Unstar' : 'Star'}
                className={`rounded-lg border bg-white px-2.5 py-1.5 text-sm transition hover:bg-gray-50 ${message.isStarred ? 'text-amber-400' : 'text-gray-500'}`}
              >
                {message.isStarred ? '★' : '☆'}
              </button>
            </form>
            <form action={archiveMessageAction}>
              <input type="hidden" name="id" value={message.id} />
              <input type="hidden" name="domainId" value={domainId} />
              <input type="hidden" name="archived" value={String(!message.isArchived)} />
              <button className="rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                {message.isArchived ? 'Unarchive' : 'Archive'}
              </button>
            </form>
            <form action={deleteMessageAction}>
              <input type="hidden" name="id" value={message.id} />
              <input type="hidden" name="domainId" value={domainId} />
              <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50">
                Delete
              </button>
            </form>
          </>
        }
      />
    </div>
  );
}
