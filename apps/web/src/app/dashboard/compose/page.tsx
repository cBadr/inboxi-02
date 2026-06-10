import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { getAvailableDomains } from '@/lib/domains';
import { ComposeForm } from '@/components/ComposeForm';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const user = await requireUser();
  const domains = await getAvailableDomains(user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Compose</h1>
      <p className="mt-1 text-sm text-gray-500">
        Send from any address on a domain you control.
      </p>
      <div className="mt-4">
        <Suspense>
          <ComposeForm domains={domains.map((d) => d.name)} />
        </Suspense>
      </div>
    </div>
  );
}
