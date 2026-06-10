import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { BlockRenderer, type Block } from '@/components/BlockRenderer';

export const dynamic = 'force-dynamic';

async function loadPage(slug: string) {
  return prisma.cmsPage.findFirst({ where: { slug, isPublished: true } }).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  return { title: page ? `${page.title} — Inboxi` : 'Not found' };
}

export default async function CmsPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();

  const blocks = Array.isArray(page.content) ? (page.content as unknown as Block[]) : [];
  return (
    <article>
      <header className="bg-white">
        <div className="mx-auto max-w-2xl px-4 pt-8">
          <h1 className="text-3xl font-bold">{page.title}</h1>
        </div>
      </header>
      <BlockRenderer blocks={blocks} />
    </article>
  );
}
