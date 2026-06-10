// Typed keys + defaults for the global settings store (Setting model).
// Centralizing these keeps the admin "control everything" surface consistent.

import type { AddressPattern } from './temp-address';

export const SETTING_KEYS = {
  TEMPMAIL_ADDRESS_PATTERN: 'tempmail.addressPattern',
  TEMPMAIL_DESTRUCTION_MINUTES: 'tempmail.destructionMinutes',
  TEMPMAIL_GATE_AFTER_MESSAGES: 'tempmail.gateAfterMessages',
  MAIL_MAX_MESSAGE_SIZE_MB: 'mail.maxMessageSizeMb',
  SITE_NAME: 'site.name',
} as const;

export interface SettingsDefaults {
  [SETTING_KEYS.TEMPMAIL_ADDRESS_PATTERN]: AddressPattern;
  [SETTING_KEYS.TEMPMAIL_DESTRUCTION_MINUTES]: number;
  [SETTING_KEYS.TEMPMAIL_GATE_AFTER_MESSAGES]: number;
  [SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB]: number;
  [SETTING_KEYS.SITE_NAME]: string;
}

export const SETTINGS_DEFAULTS: SettingsDefaults = {
  [SETTING_KEYS.TEMPMAIL_ADDRESS_PATTERN]: { type: 'alphanumeric', length: 10 },
  [SETTING_KEYS.TEMPMAIL_DESTRUCTION_MINUTES]: 60,
  [SETTING_KEYS.TEMPMAIL_GATE_AFTER_MESSAGES]: 3,
  [SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB]: 25,
  [SETTING_KEYS.SITE_NAME]: 'Inboxi',
};
