import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { getAvailableDomains } from '@/lib/domains';
import { ComposeStudio } from '@/components/ComposeStudio';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const user = await requireUser();
  const domains = await getAvailableDomains(user.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Compose</h1>
      <p className="mt-1 text-sm text-gray-500">
        Send from any address on a domain you control — to one recipient or many, with
        per-recipient variables, attachments, and optional scheduling.
      </p>
      <div className="mt-5">
        {domains.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            No domains available to you yet. Ask an admin to assign one.
          </div>
        ) : (
          <Suspense>
            <ComposeStudio domains={domains.map((d) => d.name)} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
