import { NextResponse } from 'next/server';
import { getOrCreateAnonSession } from '@/lib/anon';

// Returns the visitor's anonymous temp-mail session, creating one only when none
// exists or the current address has expired. A visitor keeps a SINGLE address
// until it expires — there is no on-demand renewal. Must be a Route Handler —
// cookies cannot be mutated during page render.
export async function POST() {
  try {
    const session = await getOrCreateAnonSession();
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
