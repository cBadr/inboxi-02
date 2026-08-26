'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIp } from '@/lib/request-ip';

// Cancel a scheduled send before the cron claims it. `api/cron/scheduled-sends`
// runs every minute and flips PENDING rows to PROCESSING as it works through
// them, so the guard here is the status filter on the update itself — not a
// read-then-write, which the cron could win in between. Only a row still
// PENDING at the instant of this update is touched; `count` tells us whether
// we won the race or the cron already claimed it.
export async function cancelScheduled(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const result = await prisma.scheduledMessage.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });

  if (result.count > 0) {
    await writeAudit({
      actorId: admin.id,
      action: AUDIT.SCHEDULED_CANCEL,
      entity: 'scheduled',
      entityId: id,
      ipAddress: await requestIp(),
    });
  }
  // count === 0 means the cron already claimed (or finished) it — nothing to
  // cancel and nothing to audit, but the list still needs a refresh.
  revalidatePath('/admin/scheduled');
}
