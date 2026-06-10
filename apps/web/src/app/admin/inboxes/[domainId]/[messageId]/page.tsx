import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';
import { AdminComposer } from '@/components/admin/AdminComposer';
import { AttachmentList } from '@/components/AttachmentList';

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

  const otp = extractOtp({
    subject: message.subject ?? undefined,
    text: message.textBody ?? undefined,
  });
  const domainName = message.domain.name;
  const sizeKb = message.sizeBytes ? Math.max(1, Math.round(message.sizeBytes / 1024)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/inboxes/${domainId}`}
          className="text-sm text-gray-500 transition hover:text-brand"
        >
          ← {domainName}
        </Link>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <article className="overflow-hidden rounded-xl border bg-white">
        {/* subject bar */}
        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-gray-900">
              {message.subject || '(no subject)'}
            </h1>
            {otp && (
              <span className="shrink-0 rounded-lg bg-green-50 px-3 py-1 font-mono text-sm font-semibold text-green-700 ring-1 ring-green-200">
                Code: {otp.code}
              </span>
            )}
          </div>

          {/* sender row */}
          <div className="mt-4 flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: avatarColor(message.fromAddress) }}
            >
              {initials(message.fromAddress)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{senderName(message.fromAddress)}</span>
                <span className="truncate font-mono text-xs text-gray-400">
                  &lt;{message.fromAddress}&gt;
                </span>
              </div>
              <div className="text-xs text-gray-500">
                to <span className="font-mono">{message.toAddress}</span>
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-400">
              <div>{new Date(message.receivedAt).toLocaleString()}</div>
              <div className="mt-0.5 flex items-center justify-end gap-2">
                {sizeKb && <span>{sizeKb} KB</span>}
                {message.isSpam && (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600">spam</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          {message.htmlBody ? (
            <iframe
              title="message"
              sandbox=""
              className="h-[60vh] w-full rounded-lg border bg-white"
              srcDoc={message.htmlBody}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800">
              {message.textBody || '(no content)'}
            </pre>
          )}
        </div>

        {/* attachments */}
        {message.attachments.length > 0 && (
          <div className="border-t bg-gray-50/50 px-6 py-4">
            <AttachmentList
              attachments={message.attachments.map((a) => ({
                id: a.id,
                filename: a.filename,
                contentType: a.contentType,
                sizeBytes: a.sizeBytes,
                hasContent: a.storageKey === 'db',
              }))}
            />
          </div>
        )}
      </article>
    </div>
  );
}

/* — display helpers — */
function senderName(addr: string): string {
  const local = addr.split('@')[0] ?? addr;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function initials(addr: string): string {
  const name = senderName(addr).trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (addr[0] ?? '?').toUpperCase();
}
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatarColor(addr: string): string {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
