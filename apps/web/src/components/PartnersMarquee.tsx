import type { Partner } from '@/lib/home-content';

// Seamless infinite marquee of partner cards. Pure CSS (track duplicated twice
// and translated -50%); pauses on hover. Renders nothing without partners.
export function PartnersMarquee({
  heading,
  partners,
}: {
  heading: string;
  partners: Partner[];
}) {
  const items = partners.filter((p) => p.name?.trim());
  if (items.length === 0) return null;
  const loop = [...items, ...items];

  return (
    <div className="border-b border-white/60 bg-white/40 py-6 backdrop-blur">
      {heading && (
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
          {heading}
        </p>
      )}
      <div className="marquee-mask">
        <div className="marquee-track gap-4">
          {loop.map((p, i) => (
            <a
              key={`${p.name}-${i}`}
              href={p.url || '#'}
              target={p.url && p.url !== '#' ? '_blank' : undefined}
              rel="noreferrer"
              className="group flex w-72 shrink-0 items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
            >
              {p.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logo} alt={p.name} className="h-9 w-24 shrink-0 rounded object-contain" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-sm font-bold text-brand">
                  {p.name[0]?.toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                {p.desc && <div className="truncate text-xs text-gray-500">{p.desc}</div>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
