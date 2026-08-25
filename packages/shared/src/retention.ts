// A subscriber's plan retention overrides the platform default, and among
// several active plans the longest one wins — nobody should lose mail because
// a *shorter* plan happened to be read first. "Forever" (0) is not a small
// number to be out-voted by a longer one; it is a hard floor that wins
// immediately, so a single forever-plan protects the subscriber regardless of
// what else they're on.

/** A retention window of 0 days means "keep forever". */
export const RETENTION_FOREVER = 0;

/** Bad data (negative, NaN, Infinity) is treated as forever rather than guessed at. */
function normalizeDays(days: number): number {
  if (!Number.isFinite(days) || days < 0) return RETENTION_FOREVER;
  return days;
}

/** Plan retention wins for a subscriber; otherwise the platform default applies. */
export function effectiveRetentionDays(planDays: number[], defaultDays: number): number {
  if (planDays.length === 0) return normalizeDays(defaultDays);

  let longest = RETENTION_FOREVER;
  for (const raw of planDays) {
    const days = normalizeDays(raw);
    if (days === RETENTION_FOREVER) return RETENTION_FOREVER;
    if (days > longest) longest = days;
  }
  return longest;
}

/** The timestamp older-than which messages may be deleted; null = keep forever. */
export function retentionCutoff(days: number, now: Date = new Date()): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() - days * 86_400_000);
}
