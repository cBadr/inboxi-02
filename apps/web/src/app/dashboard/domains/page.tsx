import { requireUser } from '@/lib/session';
import { getAvailableDomains } from '@/lib/domains';

export const dynamic = 'force-dynamic';

export default async function UserDomainsPage() {
  const user = await requireUser();
  const domains = await getAvailableDomains(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold">Domains</h1>
      <p className="mt-1 text-sm text-gray-500">Domains you can create mailboxes on.</p>

      <ul className="mt-4 divide-y rounded-lg border bg-white">
        {domains.map((d) => (
          <li key={d.id} className="flex items-center justify-between p-4">
            <span className="font-mono">{d.name}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {d.availability === 'FREE' ? 'Free' : 'Assigned'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-gray-500">
        Need a custom domain? Upgrade your plan to connect your own.
      </p>
    </div>
  );
}
