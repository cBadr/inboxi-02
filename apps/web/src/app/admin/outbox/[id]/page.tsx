import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIp } from '@/lib/request-ip';
import { MessageBody } from '@/components/MessageBody';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  SENT: 'bg-green-100 text-green-700',
  QUEUED: 'bg-gray-100 text-gray-600',
  SENDING: 'bg-blue-100 text-blue-700',
  DEFERRED: 'bg-amber-100 text-amber-700',
  BOUNCED: 'bg-orange-100 text-orange-700',
  COMPLAINED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-rose-100 text-rose-700',
};

export default async function AdminOutboundMessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const message = await prisma.outboundMessage.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!message) notFound();

  // Opening a customer's outbound body is a support-side read of their mail —
  // audited on every view, same price the inbound reader pays for MAIL_SEARCH.
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MAIL_READ_OUTBOUND,
    entity: 'outbound',
    entityId: message.id,
    ipAddress: await requestIp(),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/outbox" className="text-sm text-gray-500 hover:text-brand">
        ← Outbox
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-gray-900">
            {message.subject || '(no subject)'}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <span className="font-mono">{message.fromAddress}</span>
            <span>→</span>
            <span className="font-mono">{message.toAddress}</span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[message.status] ?? 'bg-gray-100'}`}
        >
          {message.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 text-sm sm:grid-cols-4">
        <Field label="Owner" value={message.user?.email ?? '—'} />
        <Field label="Transport" value={message.transportType ?? '—'} />
        <Field label="Attempts" value={String(message.attempts)} />
        <Field label="DKIM" value={message.dkimSigned ? 'signed' : 'no'} />
        <Field label="Queued" value={message.queuedAt.toLocaleString()} />
        <Field label="Sent" value={message.sentAt ? message.sentAt.toLocaleString() : '—'} />
        <Field label="Provider message id" value={message.providerMessageId ?? '—'} mono />
        <Field label="Spam score" value={message.spamScore != null ? String(message.spamScore) : '—'} />
      </div>

      {message.lastError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="mb-1 font-medium">Last error</div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{message.lastError}</pre>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-sm font-medium text-gray-600">Body</div>
        <MessageBody html={message.bodyHtml} text={message.bodyText} />
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 truncate text-gray-900 ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  );
}
