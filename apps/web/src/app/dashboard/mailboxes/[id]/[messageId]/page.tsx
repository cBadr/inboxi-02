import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';

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
    include: { attachments: true },
  });
  if (!message || message.mailboxId !== mailbox.id) notFound();

  if (!message.isRead) {
    await prisma.message.update({ where: { id: message.id }, data: { isRead: true } });
  }

  return (
    <div>
      <Link href={`/dashboard/mailboxes/${mailbox.id}`} className="text-sm text-gray-500 hover:text-brand">
        ← {mailbox.address}
      </Link>

      <div className="mt-3 rounded-lg border bg-white">
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h1 className="text-lg font-semibold">{message.subject || '(no subject)'}</h1>
            <div className="mt-1 text-sm text-gray-500">
              From <span className="font-medium">{message.fromAddress}</span> ·{' '}
              {new Date(message.receivedAt).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400">To {message.toAddress}</div>
          </div>
          <Link
            href={`/dashboard/compose?from=${encodeURIComponent(message.toAddress)}&to=${encodeURIComponent(message.fromAddress)}&subject=${encodeURIComponent('Re: ' + (message.subject ?? ''))}`}
            className="shrink-0 rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark"
          >
            Reply
          </Link>
        </div>

        <div className="p-4">
          {message.htmlBody ? (
            // Rendered in a sandboxed iframe to neutralise scripts/trackers.
            <iframe
              title="message"
              sandbox=""
              className="h-[60vh] w-full rounded border"
              srcDoc={message.htmlBody}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm">
              {message.textBody || '(no content)'}
            </pre>
          )}
        </div>

        {message.attachments.length > 0 && (
          <div className="border-t p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Attachments</div>
            <ul className="space-y-1 text-sm">
              {message.attachments.map((a) => (
                <li key={a.id}>
                  📎 {a.filename}{' '}
                  <span className="text-xs text-gray-400">({a.sizeBytes} bytes)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
