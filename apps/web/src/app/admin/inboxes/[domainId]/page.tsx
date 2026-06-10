import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';
import { getConnectionInfo } from '@/lib/mail-connection';
import { AdminComposer } from '@/components/admin/AdminComposer';
import { ConnectionInfo } from '@/components/admin/ConnectionInfo';

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

  const [messages, unread, connection] = await Promise.all([
    prisma.message.findMany({
      where: { domainId },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: { mailbox: { select: { address: true, type: true } }, _count: { select: { attachments: true } } },
    }),
    prisma.message.count({ where: { domainId, isRead: false } }),
    getConnectionInfo(domain.name),
  ]);

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

      {/* messages */}
      <div className="overflow-hidden rounded-xl border bg-white">
        {messages.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-10 5L2 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No mail received yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {messages.map((m) => {
              const otp = extractOtp({
                subject: m.subject ?? undefined,
                text: m.textBody ?? undefined,
              });
              const isCatchAll = m.mailbox?.type === 'CATCH_ALL';
              return (
                <li key={m.id} className="relative">
                  <Link
                    href={`/admin/inboxes/${domainId}/${m.id}`}
                    className={`flex items-start gap-3 px-4 py-3.5 transition hover:bg-gray-50 ${m.isRead ? '' : 'bg-indigo-50/30'}`}
                  >
                    {/* unread dot */}
                    <span className="mt-2 w-1.5 shrink-0">
                      {!m.isRead && <span className="block h-1.5 w-1.5 rounded-full bg-brand" />}
                    </span>
                    {/* avatar */}
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: avatarColor(m.fromAddress) }}
                    >
                      {initials(m.fromAddress)}
                    </span>
                    {/* content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${m.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}
                        >
                          {senderName(m.fromAddress)}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {timeAgo(m.receivedAt)}
                        </span>
                      </div>
                      <div
                        className={`truncate text-sm ${m.isRead ? 'text-gray-600' : 'text-gray-900'}`}
                      >
                        {m.subject || '(no subject)'}
                      </div>
                      {m.snippet && (
                        <div className="mt-0.5 truncate text-xs text-gray-400">{m.snippet}</div>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">
                          → {m.toAddress}
                        </span>
                        {isCatchAll && (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
                            catch-all
                          </span>
                        )}
                        {m._count.attachments > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            {m._count.attachments}
                          </span>
                        )}
                        {otp && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 font-mono font-semibold text-green-800">
                            Code {otp.code}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
