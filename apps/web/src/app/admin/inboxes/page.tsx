import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminInboxesPage() {
  await requireAdmin();
  const domains = await prisma.domain.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { mailboxes: true, messages: true } },
      catchAllMailbox: { include: { _count: { select: { messages: true } } } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Domain Inboxes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Every domain&apos;s mail — including the catch-all that receives anything sent to an
        unprovisioned address. Admin can read all of it here.
      </p>

      <table className="mt-4 w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="p-3">Domain</th>
            <th className="p-3">Total messages</th>
            <th className="p-3">Catch-all</th>
            <th className="p-3">Mailboxes</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {domains.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50">
              <td className="p-3 font-mono">{d.name}</td>
              <td className="p-3">{d._count.messages}</td>
              <td className="p-3">
                {d.catchAllMailbox ? (
                  <span className="text-gray-700">{d.catchAllMailbox._count.messages} msgs</span>
                ) : (
                  <span className="text-amber-600">none</span>
                )}
              </td>
              <td className="p-3">{d._count.mailboxes}</td>
              <td className="p-3">
                <Link href={`/admin/inboxes/${d.id}`} className="text-xs text-brand hover:underline">
                  View inbox →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
