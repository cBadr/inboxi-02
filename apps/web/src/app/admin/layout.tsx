import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/domains', label: 'Domains & DNS' },
  { href: '/admin/inboxes', label: 'Inboxes' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/delivery', label: 'Sending' },
  { href: '/admin/outbox', label: 'Outbox' },
  { href: '/admin/seo', label: 'SEO' },
  { href: '/admin/ads', label: 'Ads' },
  { href: '/admin/cms', label: 'CMS' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/google', label: 'Google services' },
  { href: '/admin/security', label: 'Security & Abuse' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/settings', label: 'Temp-mail settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    // A fixed 224px sidebar at every width left a phone with under 100px of
    // content. It stacks above the page until there is room for a column.
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:py-8">
      <aside className="w-full shrink-0 lg:w-56">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Admin</div>
          <div className="text-sm text-gray-600">{admin.email}</div>
          <Link href="/dashboard" className="text-xs text-brand underline">
            ← User dashboard
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="shrink-0 whitespace-nowrap rounded px-3 py-2 text-sm hover:bg-gray-100 lg:block"
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
