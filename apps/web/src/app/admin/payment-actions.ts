'use server';

import { revalidatePath } from 'next/cache';
import type { PaymentProviderType } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { GATEWAYS, saveGatewayConfig } from '@/lib/payments-config';
import { writeAudit } from '@/lib/audit';

export async function saveGateways(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const enabled = {} as Record<PaymentProviderType, boolean>;
  for (const g of GATEWAYS) enabled[g.provider] = formData.get(`enabled_${g.provider}`) === 'on';

  let dflt = String(formData.get('default') ?? 'NOWPAYMENTS') as PaymentProviderType;
  // The default must be an enabled gateway; otherwise fall back to the first enabled.
  if (!enabled[dflt]) {
    const first = GATEWAYS.find((g) => enabled[g.provider]);
    dflt = first?.provider ?? 'NOWPAYMENTS';
  }

  await saveGatewayConfig({ enabled, default: dflt });
  await writeAudit({ actorId: admin.id, action: 'payments.gateways_update', entity: 'settings' });
  revalidatePath('/admin/payments');
  revalidatePath('/pricing');
}
