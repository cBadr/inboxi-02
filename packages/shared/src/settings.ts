// Typed keys + defaults for the global settings store (Setting model).
// Centralizing these keeps the admin "control everything" surface consistent.

import type { AddressPattern } from './temp-address';

export const SETTING_KEYS = {
  TEMPMAIL_ADDRESS_PATTERN: 'tempmail.addressPattern',
  TEMPMAIL_DESTRUCTION_MINUTES: 'tempmail.destructionMinutes',
  TEMPMAIL_GATE_AFTER_MESSAGES: 'tempmail.gateAfterMessages',
  MAIL_MAX_MESSAGE_SIZE_MB: 'mail.maxMessageSizeMb',
  MAIL_RETENTION_DAYS: 'mail.retentionDays',
  MAIL_ORPHAN_RETENTION_DAYS: 'mail.orphanRetentionDays',
  SITE_NAME: 'site.name',
  ALERTS_TELEGRAM_CHAT_ID: 'alerts.telegramChatId',
} as const;

export interface SettingsDefaults {
  [SETTING_KEYS.TEMPMAIL_ADDRESS_PATTERN]: AddressPattern;
  [SETTING_KEYS.TEMPMAIL_DESTRUCTION_MINUTES]: number;
  [SETTING_KEYS.TEMPMAIL_GATE_AFTER_MESSAGES]: number;
  [SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB]: number;
  /**
   * How long a registered user's messages are kept, in days, when no active
   * subscription says otherwise. A plan's `retentionDays` always wins for a
   * subscriber. `RETENTION_FOREVER` (0) disables deletion entirely.
   */
  [SETTING_KEYS.MAIL_RETENTION_DAYS]: number;
  /**
   * Retention for messages that belong to no user — catch-all mail and
   * domain-level mail an admin sees. Defaults to `RETENTION_FOREVER` (0)
   * because deleting mail nobody owns must be an explicit decision.
   */
  [SETTING_KEYS.MAIL_ORPHAN_RETENTION_DAYS]: number;
  [SETTING_KEYS.SITE_NAME]: string;
  /** Telegram chat the PLATFORM OWNER is paged on. Never a customer's chat. */
  [SETTING_KEYS.ALERTS_TELEGRAM_CHAT_ID]: string;
}

export const SETTINGS_DEFAULTS: SettingsDefaults = {
  [SETTING_KEYS.TEMPMAIL_ADDRESS_PATTERN]: { type: 'alphanumeric', length: 10 },
  [SETTING_KEYS.TEMPMAIL_DESTRUCTION_MINUTES]: 60,
  [SETTING_KEYS.TEMPMAIL_GATE_AFTER_MESSAGES]: 3,
  [SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB]: 25,
  [SETTING_KEYS.MAIL_RETENTION_DAYS]: 30,
  [SETTING_KEYS.MAIL_ORPHAN_RETENTION_DAYS]: 0,
  [SETTING_KEYS.SITE_NAME]: 'Inboxi',
  [SETTING_KEYS.ALERTS_TELEGRAM_CHAT_ID]: '',
};
