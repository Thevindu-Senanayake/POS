/**
 * Render payloads carried on `PrintJobAgentDTO.payload`. These mirror the shapes
 * the API builds (`buildKotPayload`/`buildBillPayload` in the orders service);
 * the guards defend the agent against anything unexpected on the queue.
 */

export interface KotItem {
  name: string;
  qty: number;
  notes: string | null;
}

export interface KotPayload {
  kind: 'kot';
  orderId: string;
  channel: string;
  station: string;
  tableName: string | null;
  notes: string | null;
  createdAt: string;
  items: KotItem[];
}

export interface BillItemLine {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface BillPaymentLine {
  method: string;
  amount: number;
  reference: string | null;
  /** Cash handed over (cash tenders only). */
  tendered?: number;
  /** Change due back (only present when positive). */
  change?: number;
}

export interface BillPayload {
  kind: 'bill';
  billId: string;
  orderId: string;
  channel: string;
  label: string | null;
  currencySymbol: string;
  /** Currency label prefixing the total/payment lines (e.g. `Rs.` or `₨`). */
  currencyLabel?: string;
  /** Print the packaged venue logo at the very top of the bill (owner toggle). */
  logo?: boolean;
  /** Business header lines — each present only when its admin toggle is on. */
  businessName?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  taxNumber?: string;
  /** Footer message printed below the total. */
  footer?: string;
  items: BillItemLine[];
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  /** Service-charge percentage, for the `Service Charge (10%)` line label. */
  serviceChargePct?: number;
  total: number;
  payments: BillPaymentLine[];
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isKotPayload(payload: unknown): payload is KotPayload {
  return isRecord(payload) && payload.kind === 'kot' && Array.isArray(payload.items);
}

export function isBillPayload(payload: unknown): payload is BillPayload {
  return isRecord(payload) && payload.kind === 'bill' && Array.isArray(payload.items);
}
