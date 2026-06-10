import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { NewDomainForm } from '@/components/NewDomainForm';

export const dynamic = 'force-dynamic';

const DNS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  VERIFYING: 'bg-blue-100 text-blue-700',
  VERIFIED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default async function AdminDomainsPage() {
  await requireAdmin();
  const domains = await prisma.domain.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { mailboxes: true } },
      trustScores: { orderBy: { computedAt: 'desc' }, take: 1 },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Domains & DNS</h1>
      <p className="mt-1 text-sm text-gray-500">
        Add domains, automate Cloudflare DNS, verify records, and monitor sender reputation.
      </p>

      <div className="mt-4">
        <NewDomainForm />
      </div>

      <table className="mt-6 w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="p-3">Domain</th>
            <th className="p-3">Availability</th>
            <th className="p-3">DNS</th>
            <th className="p-3">Trust</th>
            <th className="p-3">Mailboxes</th>
            <th className="p-3">Active</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {domains.map((d) => {
            const trust = d.trustScores[0];
            return (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="p-3 font-mono">
                  <Link href={`/admin/domains/${d.id}`} className="text-brand hover:underline">
                    {d.name}
                  </Link>
                </td>
                <td className="p-3 text-xs">{d.availability}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${DNS_BADGE[d.dnsStatus] ?? ''}`}>
                    {d.dnsStatus}
                  </span>
                </td>
                <td className="p-3">
                  {trust ? (
                    <span className={`font-semibold ${scoreColor(trust.score)}`}>
                      {Math.round(trust.score)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="p-3">{d._count.mailboxes}</td>
                <td className="p-3">
                  <span className={d.isActive ? 'text-green-600' : 'text-gray-400'}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3">
                  <Link href={`/admin/domains/${d.id}`} className="text-xs text-brand hover:underline">
                    Manage →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
