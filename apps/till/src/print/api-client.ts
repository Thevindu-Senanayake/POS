import type { PrintJobAgentDTO } from './types';

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
 * Thin client for the API's print-agent surface (spec §3), authenticating with
 * the shared `x-print-agent-token`. The till *is* the agent now: `claim` is the
 * poll; `reportDone`/`reportFailed` close out a job. The server still owns retry
 * scheduling and the job lifecycle, so adding waiter tablets later needs no
 * change here.
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
