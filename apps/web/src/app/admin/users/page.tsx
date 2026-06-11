import { prisma, type Prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import {
  setUserBanned,
  setUserRole,
  createUser,
  resetUserPassword,
  setUserQuota,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const query = (sp.q ?? '').trim();
  const roleFilter = sp.role ?? '';
  const statusFilter = sp.status ?? '';

  const where: Prisma.UserWhereInput = {
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(roleFilter ? { role: { name: roleFilter } } : {}),
    ...(statusFilter === 'banned' ? { isBanned: true } : {}),
    ...(statusFilter === 'active' ? { isBanned: false } : {}),
  };

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { role: true, _count: { select: { mailboxes: true, subscriptions: true } } },
    }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage accounts, roles, send-quota overrides, and access.
        </p>
      </div>

      {/* create user */}
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Create a user
        </div>
        <ModuleActionForm action={createUser} submitLabel="Create user">
          <div className="grid gap-3 sm:grid-cols-4">
            <input name="email" type="email" placeholder="email@example.com" className="rounded border px-2 py-1.5 text-sm" />
            <input name="name" placeholder="Name (optional)" className="rounded border px-2 py-1.5 text-sm" />
            <input name="password" type="text" placeholder="Password (≥ 8 chars)" className="rounded border px-2 py-1.5 text-sm" />
            <select name="roleName" className="rounded border px-2 py-1.5 text-sm" defaultValue="">
              <option value="">(no role)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </ModuleActionForm>
      </div>

      {/* filters */}
      <form className="flex flex-wrap items-center gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search email or name…"
          className="w-56 rounded-lg border px-3 py-1.5 text-sm"
        />
        <select name="role" defaultValue={roleFilter} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={statusFilter} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Filter</button>
        {(query || roleFilter || statusFilter) && (
          <a href="/admin/users" className="text-xs text-gray-400 hover:underline">
            clear
          </a>
        )}
        <span className="ml-auto text-sm text-gray-400">{users.length} user(s)</span>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Role</th>
              <th className="p-3">Mailboxes</th>
              <th className="p-3">Send quota</th>
              <th className="p-3">Last login</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => {
              const isProtected = u.id === admin.id || u.role?.name === 'admin';
              return (
                <tr key={u.id} className={u.isBanned ? 'bg-red-50/40' : ''}>
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{u.email}</div>
                    {u.name && <div className="text-xs text-gray-400">{u.name}</div>}
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
                  <td className="p-3">
                    <form action={setUserQuota} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input
                        name="quota"
                        defaultValue={u.sendQuotaOverride ?? ''}
                        placeholder="plan"
                        className="w-16 rounded border px-1.5 py-1 text-xs"
                      />
                      <button className="text-xs text-brand hover:underline">Set</button>
                    </form>
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3">
                    {u.isBanned ? (
                      <span className="text-red-600">Banned</span>
                    ) : (
                      <span className="text-green-600">Active</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {!isProtected && (
                        <form action={setUserBanned}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="banned" value={u.isBanned ? 'false' : 'true'} />
                          <button className="text-xs text-red-500 hover:underline">
                            {u.isBanned ? 'Unban' : 'Ban'}
                          </button>
                        </form>
                      )}
                      {u.id !== admin.id && (
                        <details className="relative">
                          <summary className="cursor-pointer list-none text-xs text-gray-500 hover:text-brand">
                            Reset pw
                          </summary>
                          <form
                            action={resetUserPassword}
                            className="absolute right-0 z-10 mt-1 flex items-center gap-1 rounded-lg border bg-white p-2 shadow-lg"
                          >
                            <input type="hidden" name="id" value={u.id} />
                            <input name="password" type="text" placeholder="new password" className="w-32 rounded border px-1.5 py-1 text-xs" />
                            <button className="rounded bg-brand px-2 py-1 text-xs text-white">Set</button>
                          </form>
                        </details>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
