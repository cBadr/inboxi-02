import type { MetadataRoute } from 'next';
import { prisma } from '@inboxi/db';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://inboxi.online';

// Dynamic sitemap: static marketing routes + published CMS pages.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/pricing`, changeFrequency: 'weekly', priority: 0.8 },
  ];

  const pages = await prisma.cmsPage
    .findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } })
    .catch(() => []);

  const cmsRoutes: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${BASE}/p/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...cmsRoutes];
}
