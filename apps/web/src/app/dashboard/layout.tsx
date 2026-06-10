import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/mailboxes', label: 'Mailboxes' },
  { href: '/dashboard/domains', label: 'Domains' },
  { href: '/dashboard/api', label: 'API keys' },
  { href: '/dashboard/subscription', label: 'Subscription' },
  { href: '/dashboard/profile', label: 'Profile' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <aside className="w-52 shrink-0">
        <div className="mb-4 text-sm text-gray-500">
          {user.name || user.email}
          {user.roleName === 'admin' && (
            <Link href="/admin" className="mt-1 block text-xs text-brand underline">
              Admin panel →
            </Link>
          )}
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
