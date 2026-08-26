import { opendir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface SpoolState {
  /** False when the MTA is not colocated with the app (any dev machine). */
  available: boolean;
  /** Messages still waiting in the outbound MTA's own queue. */
  depth: number;
  /** Age of the oldest waiting message we sampled, in minutes. */
  oldestMinutes: number | null;
  /** True when counting stopped at the cap — depth is a floor, not a total. */
  capped: boolean;
}

const EMPTY: SpoolState = { available: false, depth: 0, oldestMinutes: null, capped: false };

// Counting stops here. Any number past it says the same thing operationally —
// the queue is not draining — and a directory this size should not be walked
// to completion on a page render.
const MAX_COUNT = 50_000;
const CACHE_MS = 30_000;

let cache: { at: number; state: SpoolState } | null = null;

function queueDir(): string {
  return (
    process.env.HARAKA_OUTBOUND_QUEUE_PATH ??
    // PM2 runs the web app from apps/web, so the MTA's spool is one level up.
    path.join(process.cwd(), '..', 'mta-outbound', 'queue')
  );
}

/**
 * The database only knows what the app handed over; the spool knows what
 * actually left. Production reached 254,000 files here while every row said
 * SENT, so the queue's depth is the one number that could have told the truth.
 *
 * Gated on the directory existing, exactly like HARAKA_HOST_LIST_PATH: on a dev
 * machine there is no MTA and this must stay a silent no-op.
 */
export async function readOutboundSpool(): Promise<SpoolState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;

  const dir = queueDir();
  let state: SpoolState;

  try {
    // opendir streams: readdir() would materialise a quarter of a million
    // filenames in memory on every request that asks for this number.
    const handle = await opendir(dir);
    let depth = 0;
    let capped = false;
    const earliest: string[] = [];

    for await (const entry of handle) {
      depth += 1;
      // The queue is written in roughly chronological order, so the lowest
      // names are the oldest messages — a handful is enough to age the backlog.
      if (earliest.length < 5) earliest.push(entry.name);
      if (depth >= MAX_COUNT) {
        capped = true;
        break;
      }
    }

    let oldestMinutes: number | null = null;
    for (const name of earliest.sort()) {
      try {
        const info = await stat(path.join(dir, name));
        const minutes = Math.floor((Date.now() - info.mtimeMs) / 60_000);
        if (oldestMinutes === null || minutes > oldestMinutes) oldestMinutes = minutes;
      } catch {
        /* the MTA may have delivered it out from under us — skip */
      }
    }

    state = { available: true, depth, oldestMinutes, capped };
  } catch {
    state = EMPTY;
  }

  cache = { at: Date.now(), state };
  return state;
}
