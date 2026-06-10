import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { setUserBanned, setUserRole } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: query
        ? { OR: [{ email: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { role: true, _count: { select: { mailboxes: true, subscriptions: true } } },
    }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <form className="mt-3 flex items-center gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search email or name…"
          className="w-64 rounded border px-3 py-1.5 text-sm"
        />
        <button className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Search</button>
        {query && (
          <a href="/admin/users" className="text-xs text-gray-400 hover:underline">
            clear
          </a>
        )}
      </form>
      <p className="mt-2 text-sm text-gray-500">{users.length} user(s)</p>

      <table className="mt-3 w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="p-3">Email</th>
            <th className="p-3">Role</th>
            <th className="p-3">Mailboxes</th>
            <th className="p-3">Subs</th>
            <th className="p-3">Status</th>
            <th className="p-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => (
            <tr key={u.id} className={u.isBanned ? 'bg-red-50/40' : ''}>
              <td className="p-3">
                {u.email}
                {u.name ? <span className="text-gray-400"> · {u.name}</span> : ''}
              </td>
              <td className="p-3">
                {u.id === admin.id ? (
                  <span className="text-xs text-gray-400">{u.role?.name ?? '—'} (you)</span>
                ) : (
                  <form action={setUserRole} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="roleName" defaultValue={u.role?.name ?? ''} className="rounded border px-1.5 py-1 text-xs">
                      <option value="">(none)</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button className="text-xs text-brand hover:underline">Set</button>
                  </form>
                )}
              </td>
              <td className="p-3">{u._count.mailboxes}</td>
              <td className="p-3">{u._count.subscriptions}</td>
              <td className="p-3">
                {u.isBanned ? (
                  <span className="text-red-600">Banned</span>
                ) : (
                  <span className="text-green-600">Active</span>
                )}
              </td>
              <td className="p-3">
                {u.id === admin.id || u.role?.name === 'admin' ? (
                  <span className="text-xs text-gray-300">—</span>
                ) : (
                  <form action={setUserBanned}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="banned" value={u.isBanned ? 'false' : 'true'} />
                    <button className="text-xs text-red-500 hover:underline">
                      {u.isBanned ? 'Unban' : 'Ban'}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
