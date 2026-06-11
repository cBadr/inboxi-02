'use client';

import { useEffect, useRef, useState } from 'react';

// Counts up to `value` once scrolled into view. `value` may carry a numeric
// part with surrounding text (e.g. "99.9%", "10k+") — the number animates and
// the suffix/prefix are preserved.
export function CountUp({ value, durationMs = 1400 }: { value: string; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  const match = value.match(/([^\d]*)([\d.,]+)(.*)/);
  const prefix = match?.[1] ?? '';
  const numStr = match?.[2] ?? '';
  const suffix = match?.[3] ?? '';
  const target = Number(numStr.replace(/,/g, ''));
  const decimals = numStr.includes('.') ? numStr.split('.')[1]!.length : 0;

  useEffect(() => {
    if (!match || !Number.isFinite(target)) {
      setDisplay(value);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - p, 3);
          const current = (target * eased).toFixed(decimals);
          setDisplay(`${prefix}${current}${suffix}`);
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span ref={ref}>{display}</span>;
}
