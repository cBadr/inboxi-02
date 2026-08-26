import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/mailboxes', label: 'Mailboxes' },
  { href: '/dashboard/folders', label: 'Folders' },
  { href: '/dashboard/compose', label: 'Compose' },
  { href: '/dashboard/domains', label: 'Domains' },
  { href: '/dashboard/api', label: 'API keys' },
  { href: '/dashboard/subscription', label: 'Subscription' },
  { href: '/dashboard/profile', label: 'Profile' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    // The sidebar used to be w-52 shrink-0 at every width, so a 375px phone was
    // left with about 110px of content. It stacks above the page on small
    // screens now and only becomes a column when there is room for one.
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:py-8">
      <aside className="w-full shrink-0 lg:w-52">
        <div className="mb-4 text-sm text-gray-500">
          {user.name || user.email}
          {user.roleName === 'admin' && (
            <Link href="/admin" className="mt-1 block text-xs text-brand underline">
              Admin panel →
            </Link>
          )}
        </div>
        {/* Horizontal, scrollable strip on phones; a stacked list once the
            sidebar has its own column. */}
        <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="shrink-0 rounded px-3 py-2 text-sm hover:bg-gray-100 lg:block"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 hidden lg:mt-6 lg:block">
          <LogoutButton />
        </div>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
