'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ── SEO ──────────────────────────────────────────────────────
export async function saveGlobalSeo(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const data = {
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    keywords: str(formData, 'keywords'),
    ogImage: str(formData, 'ogImage'),
  };
  await prisma.seoSetting.upsert({
    where: { scope: 'global' },
    update: data,
    create: { scope: 'global', ...data },
  });
  revalidatePath('/admin/seo');
  return { ok: true };
}

// ── Ads ──────────────────────────────────────────────────────
export async function createAdZone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const key = (str(formData, 'key') ?? '').trim();
  const name = (str(formData, 'name') ?? '').trim();
  if (!key || !name) return { ok: false, error: 'Key and name required' };
  const exists = await prisma.adZone.findUnique({ where: { key } });
  if (exists) return { ok: false, error: 'Zone key exists' };
  await prisma.adZone.create({ data: { key, name } });
  revalidatePath('/admin/ads');
  return { ok: true };
}

export async function createAd(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const zoneId = str(formData, 'zoneId');
  const name = str(formData, 'name');
  if (!zoneId || !name) return { ok: false, error: 'Zone and name required' };
  await prisma.ad.create({
    data: {
      zoneId,
      name,
      htmlContent: str(formData, 'htmlContent'),
      imageUrl: str(formData, 'imageUrl'),
      targetUrl: str(formData, 'targetUrl'),
      weight: Number(formData.get('weight') ?? 1) || 1,
    },
  });
  revalidatePath('/admin/ads');
  return { ok: true };
}

export async function toggleAd(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (ad) await prisma.ad.update({ where: { id }, data: { isActive: !ad.isActive } });
  revalidatePath('/admin/ads');
}

// ── CMS ──────────────────────────────────────────────────────
export async function createCmsPage(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const slug = (str(formData, 'slug') ?? '').trim().toLowerCase();
  const title = str(formData, 'title');
  if (!slug || !title) return { ok: false, error: 'Slug and title required' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: 'Slug must be a-z0-9-' };
  const exists = await prisma.cmsPage.findUnique({ where: { slug } });
  if (exists) return { ok: false, error: 'Slug exists' };

  // Seed with a couple of starter blocks (the page-builder block tree).
  const content = [
    { type: 'heading', props: { text: title } },
    { type: 'text', props: { text: 'Edit this page in the admin CMS.' } },
  ];
  await prisma.cmsPage.create({ data: { slug, title, content } });
  revalidatePath('/admin/cms');
  return { ok: true };
}

export async function setCmsContent(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('content') ?? '[]');
  let content: unknown;
  try {
    content = JSON.parse(raw);
  } catch {
    return;
  }
  await prisma.cmsPage.update({ where: { id }, data: { content: content as object } });
  revalidatePath('/admin/cms');
}

export async function togglePublish(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const page = await prisma.cmsPage.findUnique({ where: { id } });
  if (!page) return;
  await prisma.cmsPage.update({
    where: { id },
    data: { isPublished: !page.isPublished, publishedAt: page.isPublished ? null : new Date() },
  });
  revalidatePath('/admin/cms');
  revalidatePath(`/admin/cms/${id}`);
}

export async function updateCmsPageMeta(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  if (!title || !slug) return { ok: false, error: 'Title and slug required' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: 'Slug must be a-z0-9-' };
  const clash = await prisma.cmsPage.findFirst({ where: { slug, NOT: { id } } });
  if (clash) return { ok: false, error: 'Slug already used' };
  await prisma.cmsPage.update({ where: { id }, data: { title, slug } });
  revalidatePath(`/admin/cms/${id}`);
  revalidatePath('/admin/cms');
  return { ok: true };
}

export async function deleteCmsPage(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.cmsPage.delete({ where: { id } }).catch(() => {});
  redirect('/admin/cms');
}

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
