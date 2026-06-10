import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/domains', label: 'Domains & DNS' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/seo', label: 'SEO' },
  { href: '/admin/ads', label: 'Ads' },
  { href: '/admin/cms', label: 'CMS' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/settings', label: 'Temp-mail settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <aside className="w-56 shrink-0">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Admin</div>
          <div className="text-sm text-gray-600">{admin.email}</div>
          <Link href="/dashboard" className="text-xs text-brand underline">
            ← User dashboard
          </Link>
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
