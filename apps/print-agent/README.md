# @pos/print-agent

Standalone LAN print agent for the hospitality POS (spec §3). It polls the API's
print-job queue, renders each job as ESC/POS, and prints to the mapped thermal
printer over TCP — decoupling printing from the API so KOT/bill printing survives
an internet blip as long as the agent can reach the API on the LAN.

## How it works

1. **Claim** — `POST /api/printing/agent/claim` atomically leases due jobs
   (server increments `attempts`, moves them to `printing`).
2. **Print** — routes each job to a printer (see _Routing_), renders a KOT
   (kitchen/bar, no prices) or bill/receipt, and sends it over `tcp://ip:port`.
3. **Report** — `.../jobs/:id/done` on success, `.../jobs/:id/failed` on error.
   The **server** owns retry backoff and printer-health flips; the agent only
   reports outcomes. Its own only backoff is a reconnect backoff when the API is
   unreachable.

If a job's printer has **no IP** configured, the agent renders to **stdout** —
the zero-hardware dev path (spec §11). This is the default with the seeded
printers (blank IPs), so `pnpm dev` prints receipts to the console out of the box.

## Routing

`station → printer`. The DB printer map (`GET .../printers`) is the source of
truth; env `PRINTER_<STATION>_*` overrides win, letting you point at real
hardware without editing the DB. Station-less **bill** jobs route to the optional
`receipt` target.

## Configuration (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRINT_AGENT_TOKEN` | — (**required**) | Shared secret; sent as `x-print-agent-token`. |
| `PRINT_AGENT_API_URL` | `http://localhost:4000` | API origin (agent appends `/api`). |
| `PRINT_AGENT_ID` | `print-agent@<hostname>` | Identifier stamped on claimed jobs. |
| `PRINT_AGENT_POLL_MS` | `2000` | Idle poll interval. |
| `PRINT_AGENT_MAX_RETRIES` | `6` | Sets the reconnect-backoff cap (≤ 2 min). |
| `PRINT_AGENT_CLAIM_LIMIT` | `10` | Max jobs leased per poll. |
| `PRINT_AGENT_CONNECT_TIMEOUT_MS` | `5000` | Per-print TCP timeout. |
| `PRINT_AGENT_PRINTER_REFRESH_MS` | `30000` | Printer-map refresh cadence. |
| `PRINTER_KITCHEN_IP` / `_PORT` / `_TYPE` | — / `9100` / `epson` | Kitchen override. |
| `PRINTER_BAR_IP` / `_PORT` / `_TYPE` | — / `9100` / `epson` | Bar override. |
| `PRINTER_RECEIPT_IP` / `_PORT` / `_TYPE` | — / `9100` / `epson` | Bill/receipt override. |

Printer `type` accepts `epson` (default), `star`, `tanca`, `daruma`, `brother`.

## Run

```bash
# dev (loads repo-root .env, watches src)
pnpm --filter @pos/print-agent dev

# build + run
pnpm --filter @pos/print-agent build
pnpm --filter @pos/print-agent start
```

> Real thermal-printer hardware and on-site network printing must be validated on
> location (spec §12) — the stdout fallback proves the queue/route/report flow, not
> the physical print.
