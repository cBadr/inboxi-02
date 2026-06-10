import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { loginSchema } from '@inboxi/shared';
import { verifyPassword, createAuthCookie } from '@/lib/auth';

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

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }
  if (user.isBanned || !user.isActive) {
    return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createAuthCookie({ userId: user.id, email: user.email, role: user.role?.name ?? null });

  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
