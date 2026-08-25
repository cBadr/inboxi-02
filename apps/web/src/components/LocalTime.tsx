'use client';

import { useEffect, useState } from 'react';

// Server components format dates in the server's timezone, which is UTC — so
// every message looked like it arrived at the wrong time. Render a stable ISO
// slice first (no hydration mismatch), then swap in the reader's own locale.
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    setLabel(
      date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    );
  }, [iso]);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label ?? iso.slice(0, 16).replace('T', ' ')}
    </time>
  );
}
