import type { ReceiptSink } from './receipt';

/** Escape text destined for HTML — item names, notes and totals are user data. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A {@link ReceiptSink} that renders the receipt as an HTML document instead of
 * raw ESC/POS. Chromium then prints that document to the installed Windows
 * printer driver via `webContents.print({ silent, deviceName })` — the driver
 * owns paper width, the auto-cut and the cash-drawer kick, so the till needs no
 * native print module and no per-model ESC/POS profile.
 *
 * Each layout call becomes a styled block; the current align/bold/emphasize
 * state is captured per line (matching how `renderKot`/`renderBill` drive the
 * sink), so the visual result mirrors the old thermal output.
 */
export class HtmlSink implements ReceiptSink {
  private readonly blocks: string[] = [];
  private align: 'left' | 'center' = 'left';
  private isBold = false;
  private isEmphasized = false;

  /** @param logoDataUri data: URI for the venue logo, or null to skip it. */
  constructor(private readonly logoDataUri: string | null = null) {}

  alignCenter(): void {
    this.align = 'center';
  }
  alignLeft(): void {
    this.align = 'left';
  }
  bold(enabled: boolean): void {
    this.isBold = enabled;
  }
  emphasize(enabled: boolean): void {
    this.isEmphasized = enabled;
  }

  /** CSS classes for the current inline state, shared by println/leftRight. */
  private classes(): string {
    const c = ['line'];
    if (this.align === 'center') c.push('c');
    if (this.isBold) c.push('b');
    if (this.isEmphasized) c.push('lg');
    return c.join(' ');
  }

  println(text: string): void {
    // A blank println still needs vertical space, hence the &nbsp; fallback.
    this.blocks.push(`<div class="${this.classes()}">${esc(text) || '&nbsp;'}</div>`);
  }

  leftRight(left: string, right: string): void {
    this.blocks.push(
      `<div class="${this.classes()} lr"><span>${esc(left)}</span><span>${esc(right)}</span></div>`,
    );
  }

  drawLine(): void {
    this.blocks.push('<div class="rule"></div>');
  }

  newLine(): void {
    this.blocks.push('<div class="sp"></div>');
  }

  async printLogo(): Promise<void> {
    if (!this.logoDataUri) return;
    this.blocks.push(`<div class="logo"><img src="${this.logoDataUri}" alt="" /></div>`);
  }

  /** No-op: the Windows driver performs the cut after the page prints. */
  cut(): void {}

  /**
   * Wrap the accumulated blocks in a full document sized for a thermal roll.
   * `widthMm` is the printable content width (72mm suits an 80mm printer); the
   * page margin is zeroed so the driver's roll length governs the receipt.
   */
  toDocument(widthMm: number): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: ${widthMm}mm;
    padding: 2mm 1mm;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 12px;
    line-height: 1.35;
    -webkit-font-smoothing: none;
  }
  .line { white-space: pre-wrap; word-break: break-word; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .lg { font-size: 16px; font-weight: 700; }
  .lr { display: flex; justify-content: space-between; gap: 8px; }
  .lr > span:last-child { white-space: nowrap; }
  .rule { border-top: 1px dashed #000; margin: 3px 0; height: 0; }
  .sp { height: 10px; }
  .logo { text-align: center; margin-bottom: 4px; }
  .logo img { max-width: 100%; height: auto; }
</style>
</head>
<body>${this.blocks.join('')}</body>
</html>`;
  }
}
