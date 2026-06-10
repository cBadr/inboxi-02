import { NextRequest, NextResponse } from 'next/server';
import { inboundMailSchema } from '@inboxi/shared';
import { ingestInbound } from '@/lib/ingest';

// Inbound mail ingest endpoint. The Haraka inbound MTA parses a received
// message and POSTs it here with a shared secret. Decoupling the MTA from the
// database keeps the mail server thin and lets the web app own persistence.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret');
  if (!process.env.MAIL_INGEST_SECRET || secret !== process.env.MAIL_INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = inboundMailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await ingestInbound(parsed.data);
  const status = result.target === 'rejected' ? 550 : 200;
  return NextResponse.json(result, { status: status === 550 ? 422 : 200 });
}
