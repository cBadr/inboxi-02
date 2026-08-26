import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { loginSchema } from '@inboxi/shared';
import { verifyPassword, createAuthCookie } from '@/lib/auth';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIpFrom } from '@/lib/request-ip';

// A failed login writes an audit row from an endpoint nobody has authenticated
// against yet, so a single attacker could inflate the table at will and bury
// the real LOGIN_FAILED signal underneath. Keep the first failure per IP per
// minute: enough to see an attack starting, bounded enough to survive one.
// (PM2 runs one instance, so this map is the whole application's view. A real
// rate limiter on the endpoint is the proper fix and is tracked in
// docs/audits/admin-panel-gap-analysis.md.)
const FAILURE_LOG_WINDOW_MS = 60_000;
const lastFailureLoggedAt = new Map<string, number>();

function shouldLogFailure(ip: string | null): boolean {
  const key = ip ?? 'unknown';
  const now = Date.now();
  const last = lastFailureLoggedAt.get(key);
  if (last !== undefined && now - last < FAILURE_LOG_WINDOW_MS) return false;
  lastFailureLoggedAt.set(key, now);
  if (lastFailureLoggedAt.size > 5_000) {
    for (const [k, t] of lastFailureLoggedAt) {
      if (now - t > FAILURE_LOG_WINDOW_MS) lastFailureLoggedAt.delete(k);
    }
  }
  return true;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 422 });
  }
  const { email, password } = parsed.data;
  const ipAddress = requestIpFrom(req);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    // Never log the password (or any part of it) — only that an attempt happened,
    // and against which email. actorId is null when the email doesn't match anyone.
    if (shouldLogFailure(ipAddress))
      await writeAudit({
        actorId: user?.id ?? null,
        action: AUDIT.LOGIN_FAILED,
        entity: 'user',
        entityId: user?.id,
        ipAddress,
        metadata: { email, reason: 'invalid_credentials' },
      });
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }
  if (user.isBanned || !user.isActive) {
    if (shouldLogFailure(ipAddress))
      await writeAudit({
        actorId: user.id,
        action: AUDIT.LOGIN_FAILED,
        entity: 'user',
        entityId: user.id,
        ipAddress,
        metadata: { email, reason: 'account_disabled' },
      });
    return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createAuthCookie({ userId: user.id, email: user.email, role: user.role?.name ?? null });
  await writeAudit({
    actorId: user.id,
    action: AUDIT.LOGIN_SUCCESS,
    entity: 'user',
    entityId: user.id,
    ipAddress,
  });

  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
