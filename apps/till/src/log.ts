/** Tiny prefixed logger so the shell's lines are greppable in print-agent.log-style output. */
function stamp(): string {
  return new Date().toISOString();
}

export function log(message: string): void {
  console.log(`[till] ${stamp()} ${message}`);
}

export function warn(message: string): void {
  console.warn(`[till] ${stamp()} WARN  ${message}`);
}

export function error(message: string): void {
  console.error(`[till] ${stamp()} ERROR ${message}`);
}
