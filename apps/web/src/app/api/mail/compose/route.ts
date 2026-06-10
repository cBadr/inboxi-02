import { NextRequest, NextResponse } from 'next/server';
import { composeSchema } from '@inboxi/shared';
import { getCurrentUser } from '@/lib/session';
import { sendComposed, scheduleComposed } from '@/lib/compose';

// Authenticated compose endpoint: send-now to many recipients (with per-recipient
// variable substitution + attachments) or schedule for later delivery.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = composeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const input = parsed.data;

  // Schedule when scheduleAt is meaningfully in the future (> 30s).
  if (input.scheduleAt) {
    const at = new Date(input.scheduleAt);
    if (at.getTime() > Date.now() + 30_000) {
      const id = await scheduleComposed(user, input, at);
      return NextResponse.json({ ok: true, scheduled: true, id, at: at.toISOString() });
    }
  }

  const result = await sendComposed(user, input);
  return NextResponse.json({ ok: result.sent > 0, scheduled: false, ...result });
}
