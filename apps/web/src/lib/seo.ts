import type { Metadata } from 'next';
import { prisma } from '@inboxi/db';

export interface SeoData {
  title: string;
  description: string;
  keywords: string | null;
  ogImage: string | null;
  canonical: string | null;
  robots: string | null;
}

const DEFAULTS: SeoData = {
  title: 'Inboxi — Free Temporary Email',
  description:
    'Instant disposable email addresses. Receive mail in seconds, no signup required to start.',
  keywords: 'temporary email, disposable email, temp mail, throwaway email',
  ogImage: null,
  canonical: null,
  robots: null,
};

// Read SEO settings for a scope ("global" or a page path), merged over defaults.
export async function getSeo(scope = 'global'): Promise<SeoData> {
  const row = await prisma.seoSetting.findUnique({ where: { scope } }).catch(() => null);
  if (!row) return DEFAULTS;
  return {
    title: row.title ?? DEFAULTS.title,
    description: row.description ?? DEFAULTS.description,
    keywords: row.keywords ?? DEFAULTS.keywords,
    ogImage: row.ogImage,
    canonical: row.canonical,
    robots: row.robots,
  };
}

export function toMetadata(seo: SeoData): Metadata {
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords ?? undefined,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    robots: seo.robots ?? undefined,
    openGraph: {
      title: seo.title,
      description: seo.description,
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
  };
}
