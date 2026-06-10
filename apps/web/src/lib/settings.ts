import { prisma } from '@inboxi/db';
import { SETTINGS_DEFAULTS, type SettingsDefaults } from '@inboxi/shared';

// Read a setting from the DB, falling back to the typed default.
export async function getSetting<K extends keyof SettingsDefaults>(
  key: K,
): Promise<SettingsDefaults[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row && row.value != null) {
    return row.value as SettingsDefaults[K];
  }
  return SETTINGS_DEFAULTS[key];
}

// Write a setting (upsert) — used by the admin settings editor.
export async function setSetting<K extends keyof SettingsDefaults>(
  key: K,
  value: SettingsDefaults[K],
  category = 'general',
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object, category },
  });
}
