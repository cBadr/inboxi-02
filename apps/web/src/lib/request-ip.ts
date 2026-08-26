import { headers } from 'next/headers';

// nginx sits in front of the app, so the socket address is always 127.0.0.1 —
// the caller's address only survives in the forwarding headers.
function pick(get: (name: string) => string | null): string | null {
  const forwarded = get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first.slice(0, 45); // an IPv6 literal fits in 45 chars
  const real = get('x-real-ip')?.trim();
  return real ? real.slice(0, 45) : null;
}

/** Caller IP inside a route handler, where the request object is in hand. */
export function requestIpFrom(req: Request): string | null {
  return pick((name) => req.headers.get(name));
}

/** Caller IP inside a server action or a server component. */
export async function requestIp(): Promise<string | null> {
  try {
    const store = await headers();
    return pick((name) => store.get(name));
  } catch {
    // headers() throws outside a request scope; an audit row without an IP
    // still beats losing the audit row.
    return null;
  }
}
