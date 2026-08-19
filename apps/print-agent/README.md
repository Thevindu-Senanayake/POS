# @pos/print-agent

Standalone print agent for the hospitality POS (spec §3). It polls the API's
print-job queue, renders each job as ESC/POS, and prints it to the mapped
printer — **network (TCP) KOT printers** in the kitchen/bar and the **USB
customer bill/receipt printer** on the till PC — decoupling printing from the API
so KOT/bill printing survives an internet blip as long as the agent can reach the
API on the LAN.

## How it works

1. **Claim** — `POST /api/printing/agent/claim` atomically leases due jobs
   (server increments `attempts`, moves them to `printing`).
2. **Print** — routes each job to a printer by **role** (see _Routing_), renders a
   KOT (kitchen/bar, no prices) or bill/receipt, and sends it over either a network
   `tcp://ip:port` connection or the host OS spooler (`printer:<device>`) for USB.
3. **Report** — `.../jobs/:id/done` on success, `.../jobs/:id/failed` on error.
   The **server** owns retry backoff and printer-health flips; the agent only
   reports outcomes. Its own only backoff is a reconnect backoff when the API is
   unreachable.

If a job's target has **no destination** configured (a `network` printer with no
IP, or a `usb` printer whose native driver isn't installed), the agent renders to
**stdout** — the zero-hardware dev path (spec §11). This is the default with the
seeded printers, so `pnpm dev` prints receipts to the console out of the box.

## Routing

`role → printer`. KOT jobs carry a `station` (`kitchen`/`bar`) and route to that
role's **network** printer; station-less **bill** jobs route to the `receipt`
role, which on the till is the **USB** printer. The DB printer map
(`GET .../printers`) is the source of truth; env `PRINTER_<ROLE>_*` overrides win,
letting you point at real hardware without editing the DB.

### USB (OS-spooler) printing

The USB path prints through the host operating system's print spooler via an
**optional** native module, [`@thiagoelg/node-printer`](https://www.npmjs.com/package/@thiagoelg/node-printer)
(declared in `optionalDependencies`). It must be built on the till host the USB
printer is attached to, and `PRINTER_RECEIPT_DEVICE` must match the OS printer name
exactly. If the native build is absent the agent **degrades to stdout** rather than
crashing — the same graceful fallback as an unconfigured network printer — so dev
boxes and CI need no native toolchain.

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
| `PRINTER_KITCHEN_{CONNECTION,IP,PORT,TYPE}` | `network` / — / `9100` / `epson` | Kitchen KOT override. |
| `PRINTER_BAR_{CONNECTION,IP,PORT,TYPE}` | `network` / — / `9100` / `epson` | Bar KOT override. |
| `PRINTER_RECEIPT_{CONNECTION,DEVICE,IP,PORT,TYPE}` | `usb` / — / — / `9100` / `epson` | Bill/receipt override. |

`CONNECTION` is `network` (TCP to `IP:PORT`) or `usb` (OS spooler to `DEVICE`).
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
