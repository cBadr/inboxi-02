// Known plan feature flags surfaced as checkboxes in the plan editor.
// Kept out of the "use server" actions file (which may only export functions).
export const PLAN_FEATURES = [
  'api',
  'webhooks',
  'forwarding',
  'otpExtraction',
  'customDomain',
  'prioritySupport',
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];
