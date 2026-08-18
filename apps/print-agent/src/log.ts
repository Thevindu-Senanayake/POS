/** Tiny prefixed logger so the agent's lines are greppable in a shared console. */
function stamp(): string {
  return new Date().toISOString();
}

export function log(message: string): void {
  console.log(`[print-agent] ${stamp()} ${message}`);
}

export function warn(message: string): void {
  console.warn(`[print-agent] ${stamp()} WARN  ${message}`);
}

export function error(message: string): void {
  console.error(`[print-agent] ${stamp()} ERROR ${message}`);
}
