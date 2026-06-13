import type { Plan } from '@inboxi/db';

// Friendly labels for the feature flags stored on Plan.features.
export const FEATURE_LABELS: Record<string, string> = {
  api: 'Developer API access',
  webhooks: 'Webhooks on new mail',
  forwarding: 'Email forwarding',
  otpExtraction: 'OTP / code auto-extract',
  customDomain: 'Custom domains',
  prioritySupport: 'Priority support',
};

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

// Build the human-readable perk list shown on a plan card: quota lines first,
// then enabled feature flags.
export function planPerks(plan: Plan): string[] {
  const perks: string[] = [];
  perks.push(`${plan.maxMailboxes} mailbox${plan.maxMailboxes === 1 ? '' : 'es'}`);
  if (num(plan.maxDomains) > 0)
    perks.push(`${plan.maxDomains} custom domain${num(plan.maxDomains) === 1 ? '' : 's'}`);
  perks.push(
    num(plan.dailyReceiveQuota) > 0 ? `${plan.dailyReceiveQuota} received / day` : 'Unlimited receiving',
  );
  if (num(plan.dailySendQuota) > 0) perks.push(`${plan.dailySendQuota} sent / day`);
  perks.push(
    plan.retentionDays >= 3650 ? 'Permanent message history' : `${plan.retentionDays}-day retention`,
  );

  const flags = Array.isArray(plan.features) ? (plan.features as string[]) : [];
  for (const f of flags) if (FEATURE_LABELS[f]) perks.push(FEATURE_LABELS[f]);
  return perks;
}
