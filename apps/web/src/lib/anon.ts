import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma, AnonGateStatus } from '@inboxi/db';
import { generateTempAddress } from '@inboxi/shared';
import { getSetting } from './settings';

const ANON_COOKIE = 'inboxi_anon';

export interface AnonSessionView {
  token: string;
  address: string;
  expiresAt: string;
  gateStatus: AnonGateStatus;
  messageCount: number;
  gateAfter: number;
}

// Get the active anonymous session from the cookie, or create a fresh one
// with a generated temp address on the default free domain.
export async function getOrCreateAnonSession(): Promise<AnonSessionView> {
  const jar = await cookies();
  const existingToken = jar.get(ANON_COOKIE)?.value;
  const gateAfter = await getSetting('tempmail.gateAfterMessages');

  if (existingToken) {
    const session = await prisma.anonymousSession.findUnique({
      where: { token: existingToken },
    });
    if (session && session.expiresAt > new Date()) {
      return {
        token: session.token,
        address: session.tempAddress,
        expiresAt: session.expiresAt.toISOString(),
        gateStatus: session.gateStatus,
        messageCount: session.messageCount,
        gateAfter,
      };
    }
  }

  // Create a new session.
  const domain = await prisma.domain.findFirst({
    where: { availability: 'FREE', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!domain) {
    throw new Error('No free domain configured');
  }

  const pattern = await getSetting('tempmail.addressPattern');
  const minutes = await getSetting('tempmail.destructionMinutes');
  const token = randomBytes(24).toString('hex');
  const address = generateTempAddress(domain.name, pattern);
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  const session = await prisma.anonymousSession.create({
    data: {
      token,
      tempAddress: address,
      domainId: domain.id,
      expiresAt,
    },
  });

  jar.set(ANON_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });

  return {
    token: session.token,
    address: session.tempAddress,
    expiresAt: session.expiresAt.toISOString(),
    gateStatus: session.gateStatus,
    messageCount: session.messageCount,
    gateAfter,
  };
}
