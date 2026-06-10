import { NextResponse } from 'next/server';
import { getOrCreateAnonSession } from '@/lib/anon';

// Creates (or returns) the visitor's anonymous temp-mail session and sets the
// cookie. Must be a Route Handler — cookies cannot be mutated during page render.
export async function POST() {
  try {
    const session = await getOrCreateAnonSession();
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
