// RBAC permission keys — the single source of truth shared by the seed,
// the API authorization layer, and the admin UI. Keep in sync with the
// permissions seeded in packages/db/prisma/seed.ts.

export const PERMISSIONS = {
  DOMAIN_MANAGE: 'domain.manage',
  DOMAIN_DNS: 'domain.dns',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  PLAN_MANAGE: 'plan.manage',
  MAILBOX_MANAGE: 'mailbox.manage',
  MAIL_SEND: 'mail.send',
  DELIVERY_MANAGE: 'delivery.manage',
  CMS_MANAGE: 'cms.manage',
  SEO_MANAGE: 'seo.manage',
  ADS_MANAGE: 'ads.manage',
  INTEGRATION_MANAGE: 'integration.manage',
  ANALYTICS_VIEW: 'analytics.view',
  SETTINGS_MANAGE: 'settings.manage',
  ABUSE_MANAGE: 'abuse.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export function hasPermission(granted: string[], required: PermissionKey): boolean {
  return granted.includes(required);
}
