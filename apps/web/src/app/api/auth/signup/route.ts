import { NextRequest, NextResponse } from 'next/server';
import { prisma, AnonGateStatus } from '@inboxi/db';
import { signupSchema } from '@inboxi/shared';
import { hashPassword, createAuthCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 });
  }

  const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash,
      roleId: userRole?.id ?? null,
    },
  });

  // Link the current anonymous session (if any) so withheld messages unlock.
  const anonToken = req.cookies.get('inboxi_anon')?.value;
  let unlockedMessages = 0;
  if (anonToken) {
    const session = await prisma.anonymousSession.findUnique({ where: { token: anonToken } });
    if (session && !session.userId) {
      await prisma.$transaction([
        prisma.anonymousSession.update({
          where: { id: session.id },
          data: { userId: user.id, gateStatus: AnonGateStatus.CONVERTED },
        }),
        prisma.message.updateMany({
          where: { anonymousSessionId: session.id, isGated: true },
          data: { isGated: false },
        }),
      ]);
      unlockedMessages = await prisma.message.count({
        where: { anonymousSessionId: session.id },
      });
    }
  }

  await createAuthCookie({ userId: user.id, email: user.email, role: userRole?.name ?? null });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    unlockedMessages,
  });
}
