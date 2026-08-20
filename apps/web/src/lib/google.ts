import { prisma, type IntegrationKind } from '@inboxi/db';
import { gtmConfigSchema, type GtmConfig } from '@inboxi/shared';

// Platform-owned Google integrations.
//
// These live in the Integration table with userId = NULL. Every read here scopes
// on `userId: null` EXPLICITLY. That is the whole point: an unscoped
// findFirst({ where: { kind } }) would happily return a customer's own connected
// account — the exact defect that made the deliverability monitor page a random
// customer instead of the owner.
//
// A partial unique index (migration 20260820100000_platform_integration_unique)
// guarantees at most one platform row per kind; the schema-level
// @@unique([userId, kind]) does not, because Postgres treats each NULL as
// distinct.

export interface PlatformIntegration<T> {
  isActive: boolean;
  config: T | null;
  updatedAt: Date | null;
}

async function readPlatformIntegration(
  kind: IntegrationKind,
): Promise<{ isActive: boolean; config: unknown; updatedAt: Date } | null> {
  return prisma.integration.findFirst({
    where: { kind, userId: null },
    select: { isActive: true, config: true, updatedAt: true },
  });
}

async function writePlatformIntegration(
  kind: IntegrationKind,
  data: { isActive: boolean; config: object },
): Promise<void> {
  const existing = await prisma.integration.findFirst({
    where: { kind, userId: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.integration.update({ where: { id: existing.id }, data });
  } else {
    await prisma.integration.create({ data: { kind, userId: null, ...data } });
  }
}

// --- Google Tag Manager -----------------------------------------------------

export type GtmState = PlatformIntegration<GtmConfig>;

export async function getGtmState(): Promise<GtmState> {
  const row = await readPlatformIntegration('GOOGLE_TAG_MANAGER');
  if (!row) return { isActive: false, config: null, updatedAt: null };
  // A stored config that no longer parses (hand-edited, or written by an older
  // shape) is treated as unconfigured rather than injected into every page.
  const parsed = gtmConfigSchema.safeParse(row.config);
  return {
    isActive: row.isActive,
    config: parsed.success ? parsed.data : null,
    updatedAt: row.updatedAt,
  };
}

export async function saveGtm(config: GtmConfig, isActive: boolean): Promise<void> {
  await writePlatformIntegration('GOOGLE_TAG_MANAGER', { isActive, config });
}

/** The container id to render, or null when GTM is off or unconfigured. */
export async function getActiveGtm(): Promise<GtmConfig | null> {
  const state = await getGtmState();
  return state.isActive && state.config ? state.config : null;
}
