import { NextRequest, NextResponse } from 'next/server';
import { sendMessageSchema } from '@inboxi/shared';
import { getCurrentUser } from '@/lib/session';
import { sendMail } from '@/lib/send';

// Authenticated outbound send. Enforces ownership, send quota, and anti-abuse
// screening, then delivers via the resolved transport chain.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload', issues: parsed.error.flatten() }, { status: 422 });
  }

  const result = await sendMail(user, parsed.data);
  const httpStatus = result.ok ? 200 : result.status === 'BLOCKED' ? 403 : 422;
  return NextResponse.json(result, { status: httpStatus });
}
