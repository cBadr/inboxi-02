'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Fires a first-party pageview on navigation. Mounted once in the root layout.
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    // Don't track dashboard/admin internals.
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return;
    const body = JSON.stringify({
      type: 'pageview',
      path: pathname,
      referrer: document.referrer || undefined,
    });
    navigator.sendBeacon?.('/api/analytics/track', new Blob([body], { type: 'application/json' }));
  }, [pathname]);
  return null;
}
