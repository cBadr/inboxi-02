import type { Metadata } from 'next';
import './globals.css';
import { getSeo, toMetadata } from '@/lib/seo';
import { Tracker } from '@/components/Tracker';
import { GoogleTagManager } from '@/components/GoogleTagManager';
import { getActiveGtm } from '@/lib/google';
import { SocialLinks } from '@/components/SocialLinks';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import { getHomeContent } from '@/lib/home-content';
import { getCurrentUser } from '@/lib/session';

// SEO is DB-driven (admin SEO module). Falls back to sensible defaults.
export async function generateMetadata(): Promise<Metadata> {
  const meta = toMetadata(await getSeo('global'));
  return { ...meta, icons: { icon: '/logo.svg', apple: '/logo.svg' } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  const [home, user, gtm] = await Promise.all([getHomeContent(), getCurrentUser(), getActiveGtm()]);
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          {/* sticky, frosted header */}
          <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
              <a href="/" className="text-base" aria-label="Inboxi home">
                <Logo size={34} />
              </a>
              <nav className="hidden items-center gap-6 text-sm text-gray-600 md:flex">
                <a href="/#features" className="transition hover:text-brand">Features</a>
                <a href="/pricing" className="transition hover:text-brand">Pricing</a>
                <a href="/#faq" className="transition hover:text-brand">FAQ</a>
              </nav>
              <div className="flex items-center gap-2 text-sm">
                {user ? (
                  <>
                    {user.roleName === 'admin' && (
                      <a href="/admin" className="hidden rounded-lg px-3 py-1.5 text-gray-600 transition hover:text-brand sm:inline">
                        Admin
                      </a>
                    )}
                    <a
                      href="/dashboard"
                      className="rounded-lg bg-brand px-3.5 py-1.5 font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-dark"
                    >
                      Dashboard
                    </a>
                    <span
                      title={user.email}
                      className="hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-semibold text-white sm:flex"
                    >
                      {(user.name?.[0] ?? user.email[0] ?? '?').toUpperCase()}
                    </span>
                    <LogoutButton className="rounded-lg px-3 py-1.5 text-gray-500 transition hover:text-brand" />
                  </>
                ) : (
                  <>
                    <a href="/login" className="rounded-lg px-3 py-1.5 text-gray-600 transition hover:text-brand">
                      Sign in
                    </a>
                    <a
                      href="/signup"
                      className="rounded-lg bg-brand px-3.5 py-1.5 font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-dark"
                    >
                      Sign up free
                    </a>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1">{children}</main>
          <Tracker />
          {gtm && (
            <GoogleTagManager
              containerId={gtm.containerId}
              includeAppPages={gtm.includeAppPages}
            />
          )}

          {/* footer */}
          <footer className="border-t bg-white">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <div className="text-base">
                  <Logo size={36} tagline />
                </div>
                <p className="mt-3 max-w-sm text-sm text-gray-500">{home.footerTagline}</p>
                <SocialLinks socials={home.socials} className="mt-4" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Product</div>
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  <li><a href="/#features" className="hover:text-brand">Features</a></li>
                  <li><a href="/pricing" className="hover:text-brand">Pricing</a></li>
                  <li><a href="/#faq" className="hover:text-brand">FAQ</a></li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Account</div>
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  <li><a href="/login" className="hover:text-brand">Sign in</a></li>
                  <li><a href="/signup" className="hover:text-brand">Create account</a></li>
                  <li><a href="/dashboard" className="hover:text-brand">Dashboard</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t">
              <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-gray-400">
                © {year} Inboxi. All rights reserved.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
