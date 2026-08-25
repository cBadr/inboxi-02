import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractCodes } from '@inboxi/shared';
import { requireUser } from '@/lib/session';
import { MessageCard } from '@/components/MessageCard';
import {
  archiveMessageAction,
  starMessageAction,
  deleteMessageAction,
} from '../../../inbox-actions';

export const dynamic = 'force-dynamic';

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string; messageId: string }>;
}) {
  const { id, messageId } = await params;
  const user = await requireUser();

  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) notFound();

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
    },
  });
  if (!message || message.mailboxId !== mailbox.id) notFound();

  if (!message.isRead) {
    await prisma.message.update({ where: { id: message.id }, data: { isRead: true } });
  }

  const codes = extractCodes({
    subject: message.subject ?? undefined,
    text: message.textBody ?? undefined,
    html: message.htmlBody ?? undefined,
  }).map((c) => c.code);

  return (
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
      backHref={`/dashboard/mailboxes/${mailbox.id}`}
      backLabel={mailbox.address}
      actions={
        <>
          <Link
            href={`/dashboard/compose?from=${encodeURIComponent(message.toAddress)}&to=${encodeURIComponent(message.fromAddress)}&subject=${encodeURIComponent('Re: ' + (message.subject ?? ''))}`}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Reply
          </Link>
          <form action={starMessageAction}>
            <input type="hidden" name="id" value={message.id} />
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <input type="hidden" name="starred" value={String(!message.isStarred)} />
            <button
              title={message.isStarred ? 'Unstar' : 'Star'}
              className={`rounded-lg border bg-white px-2.5 py-1.5 text-sm hover:bg-gray-50 ${message.isStarred ? 'text-amber-400' : 'text-gray-500'}`}
            >
              {message.isStarred ? '★' : '☆'}
            </button>
          </form>
          <form action={archiveMessageAction}>
            <input type="hidden" name="id" value={message.id} />
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <input type="hidden" name="archived" value={String(!message.isArchived)} />
            <button className="rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {message.isArchived ? 'Unarchive' : 'Archive'}
            </button>
          </form>
          <form action={deleteMessageAction}>
            <input type="hidden" name="id" value={message.id} />
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
              Delete
            </button>
          </form>
        </>
      }
    />
  );
}
