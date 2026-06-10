export type PaymentProviderType = 'COINPAYMENTS' | 'BINANCE_PAY';

export interface CheckoutInput {
  amountUsd: number;
  orderId: string; // our internal reference (e.g. payment id)
  itemName: string;
  buyerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResult {
  provider: PaymentProviderType;
  providerRef: string; // provider order/transaction id
  payUrl?: string; // hosted checkout / payment page
  raw?: unknown;
}

export type PaymentEventStatus = 'PENDING' | 'CONFIRMING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface WebhookResult {
  valid: boolean; // signature verified
  provider: PaymentProviderType;
  orderId?: string; // our reference echoed back
  providerRef?: string;
  status?: PaymentEventStatus;
  amountUsd?: number;
  confirmations?: number;
  error?: string;
}
