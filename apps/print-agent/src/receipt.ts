import type { BillPayload, KotPayload } from './types';

/**
 * The rendering surface shared by the thermal printer and the stdout dev
 * fallback. Methods mirror the subset of `node-thermal-printer` we use, so a
 * `ThermalSink` is a thin adapter and the layout code below stays device-agnostic.
 */
export interface ReceiptSink {
  alignCenter(): void;
  alignLeft(): void;
  bold(enabled: boolean): void;
  /** Larger type for emphasis (station/table on a KOT, the grand total on a bill). */
  emphasize(enabled: boolean): void;
  println(text: string): void;
  leftRight(left: string, right: string): void;
  drawLine(): void;
  newLine(): void;
  cut(): void;
}

const CHANNEL_LABELS: Record<string, string> = {
  dine_in_restaurant: 'Dine-in · Restaurant',
  dine_in_bar: 'Dine-in · Bar',
  takeaway: 'Takeaway',
  room_service: 'Room Service',
};

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Amount with thousands separators, 2 dp, no currency (e.g. `7,750.00`). */
function fmt(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Amount prefixed with the currency label (e.g. `Rs. 7,750.00`). */
function withLabel(label: string, amount: number): string {
  return label ? `${label} ${fmt(amount)}` : fmt(amount);
}

/** Short, uppercase channel badge for the receipt meta line. */
const CHANNEL_BADGES: Record<string, string> = {
  dine_in_restaurant: 'DINE IN',
  dine_in_bar: 'BAR',
  takeaway: 'TAKEAWAY',
  room_service: 'ROOM SERVICE',
};

function channelBadge(channel: string): string {
  return CHANNEL_BADGES[channel] ?? channel.replace(/_/g, ' ').toUpperCase();
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  charge_to_room: 'Charged to room',
};

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

/** Kitchen/bar ticket — never shows prices (spec §3.1). */
export function renderKot(sink: ReceiptSink, p: KotPayload): void {
  sink.alignCenter();
  sink.bold(true);
  sink.emphasize(true);
  sink.println(`*** ${p.station.toUpperCase()} ***`);
  sink.emphasize(false);
  sink.bold(false);
  sink.println(channelLabel(p.channel));
  sink.alignLeft();
  sink.drawLine();

  sink.println(`Order #${shortId(p.orderId)}`);
  if (p.tableName) {
    sink.bold(true);
    sink.println(`Table: ${p.tableName}`);
    sink.bold(false);
  }
  sink.println(formatTime(p.createdAt));
  sink.drawLine();

  for (const item of p.items) {
    sink.emphasize(true);
    sink.println(`${item.qty} x ${item.name}`);
    sink.emphasize(false);
    if (item.notes) sink.println(`   - ${item.notes}`);
  }

  if (p.notes) {
    sink.drawLine();
    sink.println(`Note: ${p.notes}`);
  }
  sink.newLine();
  sink.cut();
}

/** Customer receipt/bill (spec §2.6/§3.1). Business header + footer are owner-
 * editable (each line printed only when present); the currency label prefixes
 * the total and payment lines. Cash tenders print the amount handed over and the
 * change due. */
export function renderBill(sink: ReceiptSink, p: BillPayload): void {
  const label = p.currencyLabel || p.currencySymbol || '';

  // --- Business header — each line only if the API populated it (toggle on) ---
  sink.alignCenter();
  if (p.businessName) {
    sink.bold(true);
    sink.emphasize(true);
    sink.println(p.businessName);
    sink.emphasize(false);
    sink.bold(false);
  }
  if (p.tagline) sink.println(p.tagline);
  if (p.address) sink.println(p.address);
  if (p.phone) sink.println(`Tel: ${p.phone}`);
  if (p.taxNumber) sink.println(p.taxNumber);
  sink.alignLeft();
  sink.drawLine();

  // --- Order meta ---
  sink.leftRight(`#${shortId(p.orderId)}`, channelBadge(p.channel));
  sink.println(formatTime(p.createdAt));
  if (p.label) sink.println(p.label);
  sink.drawLine();

  // --- Items: name on its own line, then `qty × unit` left / line total right ---
  for (const item of p.items) {
    sink.bold(true);
    sink.println(item.description);
    sink.bold(false);
    sink.leftRight(`  ${item.qty} x ${fmt(item.unitPrice)}`, fmt(item.lineTotal));
  }
  sink.drawLine();

  // --- Totals (no currency label on these lines) ---
  sink.leftRight('Subtotal', fmt(p.subtotal));
  if (p.discountTotal > 0) sink.leftRight('Discount', `-${fmt(p.discountTotal)}`);
  if (p.serviceCharge > 0) {
    const pctLabel = p.serviceChargePct ? ` (${p.serviceChargePct}%)` : '';
    sink.leftRight(`Service Charge${pctLabel}`, fmt(p.serviceCharge));
  }
  sink.drawLine();

  // --- Grand total (the only line that carries the currency label + emphasis) ---
  sink.bold(true);
  sink.emphasize(true);
  sink.leftRight('TOTAL', withLabel(label, p.total));
  sink.emphasize(false);
  sink.bold(false);

  // --- Payments: cash shows tender + change; card/room show the amount ---
  for (const pay of p.payments) {
    if (pay.method === 'cash' && pay.tendered != null) {
      sink.leftRight(paymentLabel(pay.method), withLabel(label, pay.tendered));
      if (pay.change != null && pay.change > 0) {
        sink.leftRight('Change', withLabel(label, pay.change));
      }
    } else {
      sink.leftRight(paymentLabel(pay.method), withLabel(label, pay.amount));
    }
    if (pay.reference) sink.println(`  ref: ${pay.reference}`);
  }

  // --- Footer message (owner-editable; only if present) ---
  if (p.footer) {
    sink.newLine();
    sink.alignCenter();
    sink.println(p.footer);
    sink.alignLeft();
  }
  sink.newLine();
  sink.cut();
}
