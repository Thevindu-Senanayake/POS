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

function money(symbol: string, amount: number): string {
  return `${symbol}${amount.toFixed(2)}`;
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

/** Customer receipt/bill (spec §2.6/§3.1). */
export function renderBill(sink: ReceiptSink, p: BillPayload): void {
  const sym = p.currencySymbol || '';
  sink.alignCenter();
  sink.bold(true);
  sink.emphasize(true);
  sink.println('RECEIPT');
  sink.emphasize(false);
  sink.bold(false);
  sink.println(channelLabel(p.channel));
  if (p.label) sink.println(p.label);
  sink.alignLeft();
  sink.drawLine();

  for (const item of p.items) {
    sink.leftRight(`${item.qty} x ${item.description}`, money(sym, item.lineTotal));
  }
  sink.drawLine();

  sink.leftRight('Subtotal', money(sym, p.subtotal));
  if (p.discountTotal > 0) sink.leftRight('Discount', `-${money(sym, p.discountTotal)}`);
  if (p.serviceCharge > 0) sink.leftRight('Service charge', money(sym, p.serviceCharge));
  sink.drawLine();

  sink.bold(true);
  sink.emphasize(true);
  sink.leftRight('TOTAL', money(sym, p.total));
  sink.emphasize(false);
  sink.bold(false);
  sink.drawLine();

  for (const pay of p.payments) {
    sink.leftRight(`Paid · ${pay.method}`, money(sym, pay.amount));
    if (pay.reference) sink.println(`   ref: ${pay.reference}`);
  }

  sink.newLine();
  sink.alignCenter();
  sink.println('Thank you!');
  sink.println(`Order #${shortId(p.orderId)}`);
  sink.println(formatTime(p.createdAt));
  sink.alignLeft();
  sink.newLine();
  sink.cut();
}
