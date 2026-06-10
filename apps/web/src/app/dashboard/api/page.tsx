import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { revokeApiKey } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const user = await requireUser();
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Developer API</h1>
      <p className="mt-1 text-sm text-gray-500">
        Authenticate with <code>Authorization: Bearer &lt;key&gt;</code> against{' '}
        <code>/api/v1/mailboxes</code> and <code>/api/v1/messages</code>.
      </p>

      <div className="mt-4">
        <ApiKeyManager />
      </div>

      <ul className="mt-6 divide-y rounded-lg border bg-white">
        {keys.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No API keys yet.</li>
        )}
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between p-4">
            <div>
              <span className="font-medium">{k.name}</span>{' '}
              <code className="text-xs text-gray-400">{k.keyPrefix}…</code>
              {!k.isActive && <span className="ml-2 text-xs text-red-500">revoked</span>}
            </div>
            {k.isActive && (
              <form action={revokeApiKey}>
                <input type="hidden" name="id" value={k.id} />
                <button className="text-sm text-red-500 hover:underline">Revoke</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
