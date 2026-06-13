'use server';

import { revalidatePath } from 'next/cache';
import type { PaymentProviderType } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import {
  GATEWAYS,
  CREDENTIAL_FIELDS,
  saveGatewayConfig,
  saveGatewayCredentials,
} from '@/lib/payments-config';
import { writeAudit } from '@/lib/audit';

// Save (or update) one gateway's account credentials. Empty fields are kept.
export async function saveGatewayAccount(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const provider = String(formData.get('provider') ?? '') as PaymentProviderType;
  const fields = CREDENTIAL_FIELDS[provider];
  if (!fields) return;
  const values: Record<string, string> = {};
  for (const f of fields) values[f.key] = String(formData.get(f.key) ?? '');
  await saveGatewayCredentials(provider, values);
  await writeAudit({ actorId: admin.id, action: 'payments.credentials_update', entity: 'payments', entityId: provider });
  revalidatePath('/admin/payments');
}

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
