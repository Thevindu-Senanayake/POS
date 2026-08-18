import type { PrinterDTO, PrintJobAgentDTO } from '@pos/shared';

/** Error carrying the HTTP status (absent on transport failures) so callers can branch. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin client for the print-agent API surface (spec §3), authenticating with the
 * shared `x-print-agent-token`. `claim` is the poll; `reportDone`/`reportFailed`
 * close out a job — the server owns retry scheduling and printer health, so the
 * agent only reports the outcome (station defaults to the job's own on the server).
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  claim(agentId: string, limit: number): Promise<PrintJobAgentDTO[]> {
    return this.request<PrintJobAgentDTO[]>('POST', '/printing/agent/claim', { agentId, limit });
  }

  async reportDone(id: string, agentId: string): Promise<void> {
    await this.request('POST', `/printing/agent/jobs/${id}/done`, { agentId });
  }

  async reportFailed(id: string, agentId: string, error: string): Promise<void> {
    await this.request('POST', `/printing/agent/jobs/${id}/failed`, { agentId, error });
  }

  listPrinters(): Promise<PrinterDTO[]> {
    return this.request<PrinterDTO[]>('GET', '/printing/agent/printers');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-print-agent-token': this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      // Transport-level failure (API down, DNS, connection refused) — no HTTP status.
      throw new ApiError(`${method} ${path} failed: ${(cause as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(`${method} ${path} -> ${res.status} ${text}`.trim(), res.status);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
