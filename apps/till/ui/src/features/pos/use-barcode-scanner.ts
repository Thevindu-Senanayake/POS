'use client';

import { useEffect, useRef } from 'react';

// HID barcode scanners "type" their payload far faster than a human — inter-key
// gaps are a few ms. A gap longer than this means manual typing, so the buffer
// is restarted and a stray keypress never merges into a scan.
const MAX_INTERKEY_MS = 50;
// The venue's stock uses 13-digit EAN barcodes; require a sane minimum so a lone
// Enter (or a short manual burst) is never mistaken for a scan.
const MIN_LENGTH = 6;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Listen for a USB HID barcode scanner (bar only, spec feature (c)). Such a
 * scanner emulates a keyboard: it emits the barcode's characters in a rapid
 * burst followed by Enter. We accumulate single-character keydowns that arrive
 * close together and, on Enter, hand the buffer to `onScan` when it's long
 * enough to be a real code. Keystrokes are ignored while a text field is focused
 * (so searching the menu or typing notes is never captured), and the listener is
 * only attached while `enabled` (the bar screen). Manual typing is naturally
 * excluded: human inter-key gaps exceed the burst threshold, so the buffer keeps
 * resetting to a single character and never reaches the minimum length.
 */
export function useBarcodeScanner(enabled: boolean, onScan: (code: string) => void): void {
  // Hold the latest callback so the listener isn't re-subscribed every render.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let lastAt = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const now = e.timeStamp; // ms since document load — monotonic, no clock needed
      if (e.key === 'Enter') {
        const code = buffer;
        buffer = '';
        if (code.length >= MIN_LENGTH) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      // Only printable single characters form a barcode; ignore Shift, Tab, etc.
      if (e.key.length !== 1) return;
      // A slow gap means this isn't part of a scanner burst — start a fresh code.
      buffer = now - lastAt > MAX_INTERKEY_MS ? e.key : buffer + e.key;
      lastAt = now;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
