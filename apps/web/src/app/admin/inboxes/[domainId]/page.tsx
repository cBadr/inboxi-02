import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';

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

  const messages = await prisma.message.findMany({
    where: { domainId },
    orderBy: { receivedAt: 'desc' },
    take: 200,
    include: { mailbox: { select: { address: true, type: true } } },
  });

  return (
    <div>
      <Link href="/admin/inboxes" className="text-sm text-gray-500 hover:text-brand">
        ← Domain inboxes
      </Link>
      <h1 className="mt-2 font-mono text-xl font-bold">{domain.name}</h1>
      <p className="mt-1 text-sm text-gray-500">{messages.length} message(s) — all addresses.</p>

      <ul className="mt-4 divide-y rounded-lg border bg-white">
        {messages.length === 0 && (
          <li className="p-8 text-center text-sm text-gray-500">No mail received yet.</li>
        )}
        {messages.map((m) => {
          const otp = extractOtp({ subject: m.subject ?? undefined, text: m.textBody ?? undefined });
          return (
            <li key={m.id} className={m.isRead ? '' : 'bg-indigo-50/40'}>
              <Link
                href={`/admin/inboxes/${domainId}/${m.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{m.fromAddress}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(m.receivedAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm">{m.subject || '(no subject)'}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                    to {m.toAddress}
                    {m.mailbox?.type === 'CATCH_ALL' ? ' · catch-all' : ''}
                  </span>
                  {otp && (
                    <span className="rounded bg-green-100 px-2 py-0.5 font-mono text-green-800">
                      Code: {otp.code}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
