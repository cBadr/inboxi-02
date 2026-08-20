'use server';

import { revalidatePath } from 'next/cache';
import { gtmConfigSchema } from '@inboxi/shared';
import { requireAdmin } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { saveGtm, getActiveGtm } from '@/lib/google';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function saveGtmSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const enabled = formData.get('enabled') === 'on';
  const rawId = String(formData.get('containerId') ?? '');
  const includeAppPages = formData.get('includeAppPages') === 'on';

  // Turning it off must not require a valid id — an operator disabling a
  // container they are about to replace should not be blocked by the field.
  if (!enabled && !rawId.trim()) {
    await saveGtm({ containerId: 'GTM-000000', includeAppPages }, false);
    await writeAudit({
      actorId: admin.id,
      action: 'integration.gtm_disabled',
      entity: 'integration',
      entityId: 'GOOGLE_TAG_MANAGER',
    });
    revalidatePath('/admin/google');
    revalidatePath('/', 'layout');
    return { ok: true };
  }

  const parsed = gtmConfigSchema.safeParse({ containerId: rawId, includeAppPages });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid container ID.' };
  }

  await saveGtm(parsed.data, enabled);
  await writeAudit({
    actorId: admin.id,
    action: enabled ? 'integration.gtm_enabled' : 'integration.gtm_disabled',
    entity: 'integration',
    entityId: 'GOOGLE_TAG_MANAGER',
    metadata: { containerId: parsed.data.containerId, includeAppPages: parsed.data.includeAppPages },
  });

  // The container is rendered from the root layout, so every cached page must be
  // revalidated — otherwise the snippet appears only on pages rendered later.
  revalidatePath('/admin/google');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Fetch the public homepage and confirm the container id is actually in the
 * served HTML. Saving a setting is not proof it reached visitors; this checks
 * the thing the operator actually cares about.
 */
export async function verifyGtmLive(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const gtm = await getActiveGtm();
  if (!gtm) return { ok: false, error: 'Tag Manager is off or has no container ID saved.' };

  // APP_URL is what the rest of the app uses for absolute links (lib/payments.ts
  // builds gateway callbacks from it); NEXT_PUBLIC_SITE_URL is the health
  // endpoint's required var. Try both before falling back to the local port.
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000')
    .trim()
    .replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/?gtm-check=1`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `Homepage returned HTTP ${res.status}.` };
    const html = await res.text();
    if (html.includes(gtm.containerId)) return { ok: true };
    return {
      ok: false,
      error: `${gtm.containerId} is not in the served homepage yet. Hard-refresh, or wait for the page cache to turn over.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the site to check: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}
