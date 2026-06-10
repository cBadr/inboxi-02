import { NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { missingProdEnv, insecureProdSecrets } from '@/lib/env';

// Readiness probe for nginx / uptime monitors / the deploy script. Checks the
// DB connection, reports build status, and flags production misconfiguration.
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  const missingEnv = missingProdEnv();
  const insecureSecrets = insecureProdSecrets();
  const ok = db && missingEnv.length === 0 && insecureSecrets.length === 0;

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      db,
      env: process.env.NODE_ENV,
      ...(missingEnv.length ? { missingEnv } : {}),
      ...(insecureSecrets.length ? { insecureSecrets } : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
