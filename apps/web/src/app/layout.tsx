import type { Metadata } from 'next';
import './globals.css';
import { getSeo, toMetadata } from '@/lib/seo';
import { Tracker } from '@/components/Tracker';

// SEO is DB-driven (admin SEO module). Falls back to sensible defaults.
export async function generateMetadata(): Promise<Metadata> {
  return toMetadata(await getSeo('global'));
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b bg-white">
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
              <a href="/" className="text-lg font-bold text-brand">
                Inboxi
              </a>
              <nav className="flex items-center gap-4 text-sm">
                <a href="/pricing" className="hover:text-brand">
                  Pricing
                </a>
                <a href="/login" className="hover:text-brand">
                  Sign in
                </a>
                <a
                  href="/signup"
                  className="rounded bg-brand px-3 py-1.5 text-white hover:bg-brand-dark"
                >
                  Sign up
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <Tracker />
          <footer className="border-t bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-gray-500">
              © {new Date().getFullYear()} Inboxi. All rights reserved.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
