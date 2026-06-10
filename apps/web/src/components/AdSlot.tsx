import { prisma } from '@inboxi/db';

// Server component that renders a weighted-random active ad for a zone and
// records an impression. Renders nothing if the zone has no eligible ads.
export async function AdSlot({ zone }: { zone: string }) {
  const adZone = await prisma.adZone
    .findUnique({
      where: { key: zone },
      include: { ads: { where: { isActive: true } } },
    })
    .catch(() => null);
  if (!adZone || adZone.ads.length === 0) return null;

  const now = new Date();
  const eligible = adZone.ads.filter(
    (a) => (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt >= now),
  );
  if (eligible.length === 0) return null;

  // Weighted pick. Deterministic-ish without Math.random: rotate by minute.
  const total = eligible.reduce((s, a) => s + Math.max(1, a.weight), 0);
  let target = (now.getMinutes() * 7 + now.getSeconds()) % total;
  let chosen = eligible[0]!;
  for (const a of eligible) {
    target -= Math.max(1, a.weight);
    if (target < 0) {
      chosen = a;
      break;
    }
  }

  await prisma.adEvent.create({ data: { adId: chosen.id, type: 'impression' } }).catch(() => {});

  if (chosen.htmlContent) {
    return <div dangerouslySetInnerHTML={{ __html: chosen.htmlContent }} />;
  }
  return (
    <a href={`/api/ads/click/${chosen.id}`} className="block" rel="nofollow sponsored">
      {chosen.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={chosen.imageUrl} alt={chosen.name} className="mx-auto rounded" />
      ) : (
        <span className="text-sm text-brand underline">{chosen.name}</span>
      )}
    </a>
  );
}
