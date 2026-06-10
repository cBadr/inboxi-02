import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { cleanupExpiredAnonSessions, enforceRetention } from './jobs';

// BullMQ-based background worker. Runs scheduled maintenance jobs on the server
// (where Redis is available). In local dev without Redis, ingest runs its
// notification side-effects inline instead.

const QUEUE_NAME = 'inboxi-maintenance';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // eslint-disable-next-line no-console
    console.error('REDIS_URL not set — worker requires Redis. Exiting.');
    process.exit(1);
  }

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  }) as unknown as ConnectionOptions;

  const queue = new Queue(QUEUE_NAME, { connection });

  // Repeatable schedules (cron). Adding with a stable jobId de-duplicates.
  await queue.add('cleanup-anon', {}, { repeat: { pattern: '*/15 * * * *' }, jobId: 'cleanup-anon' });
  await queue.add('enforce-retention', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'enforce-retention' });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'cleanup-anon':
          return { deleted: await cleanupExpiredAnonSessions() };
        case 'enforce-retention':
          return { deleted: await enforceRetention() };
        default:
          return { skipped: job.name };
      }
    },
    { connection },
  );

  worker.on('completed', (job, result) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] ${job.name} done`, result);
  });
  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] ${job?.name} failed`, err.message);
  });

  // eslint-disable-next-line no-console
  console.log('[worker] started, listening on', QUEUE_NAME);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
