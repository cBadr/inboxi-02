import { randomBytes, createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@inboxi/db';

export interface GeneratedKey {
  plaintext: string; // shown to the user once
  prefix: string;
  hash: string;
}

const PREFIX = 'inbx';

export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(24).toString('hex');
  const shortId = randomBytes(4).toString('hex');
  const plaintext = `${PREFIX}_${shortId}_${secret}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, prefix: `${PREFIX}_${shortId}`, hash };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface ApiAuthResult {
  userId: string;
  keyId: string;
}

// Authenticate a request by API key (Authorization: Bearer <key> or X-API-Key).
export async function authenticateApiKey(req: NextRequest): Promise<ApiAuthResult | null> {
  const header = req.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const plaintext = bearer ?? req.headers.get('x-api-key');
  if (!plaintext) return null;

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plaintext) },
    include: { user: true },
  });
  if (!key || !key.isActive) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  if (!key.user || key.user.isBanned || !key.user.isActive) return null;

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { userId: key.userId, keyId: key.id };
}
