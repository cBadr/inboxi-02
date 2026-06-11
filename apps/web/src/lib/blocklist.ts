import { prisma } from '@inboxi/db';

// Returns a matching blocklist reason if the email (or its domain) is blocked,
// else null. Checks both the full address (EMAIL) and its domain (DOMAIN).
export async function blockedReason(email: string): Promise<string | null> {
  const addr = email.trim().toLowerCase();
  const domain = addr.split('@')[1] ?? '';
  const hit = await prisma.blocklist.findFirst({
    where: {
      OR: [
        { kind: 'EMAIL', value: addr },
        ...(domain ? [{ kind: 'DOMAIN', value: domain }] : []),
      ],
    },
    select: { reason: true, kind: true, value: true },
  });
  if (!hit) return null;
  return hit.reason || `${hit.kind.toLowerCase()} blocked: ${hit.value}`;
}

export async function ipBlocked(ip: string): Promise<boolean> {
  if (!ip) return false;
  const hit = await prisma.blocklist.findFirst({ where: { kind: 'IP', value: ip } });
  return !!hit;
}
