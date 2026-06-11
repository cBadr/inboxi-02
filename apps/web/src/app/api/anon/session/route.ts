import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAnonSession, createFreshAnonSession } from '@/lib/anon';

// Creates (or returns) the visitor's anonymous temp-mail session and sets the
// cookie. `?fresh=1` forces a brand-new address (the "New address" action).
// Must be a Route Handler — cookies cannot be mutated during page render.
export async function POST(req: NextRequest) {
  try {
    const fresh = req.nextUrl.searchParams.get('fresh') === '1';
    const session = fresh ? await createFreshAnonSession() : await getOrCreateAnonSession();
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
