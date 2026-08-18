# Hospitality POS System — Build Instructions for Claude Code

## 0. Purpose of this document
Build spec for a Claude Code session. Single-business POS covering **Restaurant, Bar, and Room
Service**, sharing one inventory. All open questions from the previous draft have been resolved
by the owner — decisions are recorded in §0.1. Nothing below is marked [ASSUMPTION] anymore;
where a further micro-decision is needed during implementation, it's marked [DECIDE DURING BUILD]
and Claude Code should just pick the sensible option and move on rather than blocking.

### 0.1 Confirmed decisions
- **Platform:** Web app.
- **Stock deduction trigger:** at KOT confirmation (kitchen has started prepping). Reversed on
  cancellation. Never deducted on a held/draft order.
- **Room rates:** fixed, configurable per individual room **or** per room category (owner can set
  either a category default or override for a specific room).
- **Taxes:** none. Only service charge applies (channel-based, see §2.5).
- **Outlets:** single outlet (single physical location) for now — don't build multi-branch
  scaffolding yet, but don't hardcode assumptions that would make adding it later painful (e.g.
  keep an `outlet_id` nullable/foreign key on core tables so a second location can be added
  without a schema rewrite).
- **Shot pricing:** configured per portion size, not computed.
- **Bar pricing rule to re-verify with owner during UAT:** bar dine-in currently has 0% service
  charge per original spec — kept as-is, flag it in the demo so the owner can double check.

---

## 1. Tech stack
- **Frontend:** React (Next.js), Tailwind, touch-friendly layout for tablets/POS terminals in
  browser.
- **Backend:** Node.js (NestJS or Express), REST or tRPC API.
- **Database:** PostgreSQL.
- **Realtime:** WebSocket channel for live table/room status boards and KOT push to print queue.
- **Printing:** ESC/POS thermal printers over network (IP) or USB via a local print-agent service
  (Node + `node-thermal-printer`/`escpos`) polling a `print_jobs` table — browsers can't talk to
  thermal printers directly.
- **Offline resilience (see §9):** local-first order entry with a sync queue, so the POS keeps
  taking orders through a LAN/internet blip and reconciles once connectivity returns.
- **Auth:** Role-based (§7).

---

## 2. Core domain model

### 2.1 Inventory (raw materials)
Table `ingredients`:
- id, name, base_unit (`g` | `ml` | `pcs`), current_stock (derived from ledger, base unit),
  reorder_level, cost_per_unit, supplier_id (nullable).

Table `stock_movements` (append-only ledger — source of truth; `current_stock` is derived/kept in
sync transactionally, never mutated directly):
- id, ingredient_id, change_qty (+/-), reason (`purchase`, `sale`, `wastage`, `adjustment`,
  `return`), reference_type (`order_item` | `purchase_order` | `manual`), reference_id, created_by,
  created_at.

### 2.2 Goods receiving / purchasing (in scope for v1)
Table `suppliers`:
- id, name, contact_info.

Table `purchase_orders`:
- id, supplier_id, status (`draft` | `received`), ordered_at, received_at, created_by.

Table `purchase_order_items`:
- id, purchase_order_id, ingredient_id, qty (base unit), unit_cost, batch_ref (nullable).

On `purchase_orders.status → received`, write one `stock_movements` row per item
(reason=`purchase`, +qty) and update `ingredients.cost_per_unit` (e.g. weighted average) so BOM
costing stays realistic.

### 2.3 Recipes / Bill of Materials (BOM)
Table `recipes`:
- id, menu_item_id, ingredient_id, quantity (ingredient's base_unit), notes.

Sale deduction = sum over recipe rows of `quantity × item_qty_ordered`, written as
`stock_movements` rows with reason=`sale`, **triggered when the order_item's order transitions to
`sent_to_kitchen`** (see §2.6). Cancellation after that point writes a reversing row
(reason=`return`).

**Bar case:** a bottle is an ingredient with base_unit `ml` (e.g. "Whisky 750ml" = 750 units
stock). Each pour size is its **own menu item** with its own recipe row and its own price — see
§2.4. A double shot is not "2× single shot" computed; it's a distinct menu item with its own
30/60ml (or whatever pour) recipe and its own configured price.

### 2.4 Menu items & pricing rules
Table `menu_items`:
- id, name, category (`food` | `bar` | `room_service`), station (`kitchen` | `bar`) for KOT
  routing, is_active.

Table `menu_item_prices` — channel-aware, portion-aware (each portion size is a separate row
under its own `menu_items` id, per §2.3):
- id, menu_item_id, channel (`dine_in_restaurant` | `dine_in_bar` | `takeaway` | `room_service`),
  price.

Example: "Whisky (Single)" and "Whisky (Double)" are two rows in `menu_items`, each with its own
`menu_item_prices` rows per channel — no formula linking the two.

### 2.5 Service charge (channel-based)
Table `service_charge_rules`:
- id, channel, percentage.
- `dine_in_restaurant` → non-zero %. `room_service` → non-zero % (unless the charge is already
  folded into the room rate — confirm at UAT). `dine_in_bar` and `takeaway` → 0%, per original
  spec (flagged for owner re-confirmation).

No tax layer — bill total = sum(line items) + service charge, full stop.

### 2.6 Order & table lifecycle
Table `tables`:
- id, outlet_area (`restaurant` | `bar`), name/number, capacity, status
  (`free` | `occupied` | `reserved` | `needs_cleaning`).

Table `table_sessions`:
- id, table_id, opened_at, closed_at, waiter_id.

Table `orders`:
- id, channel, table_session_id (nullable), booking_id (nullable), status
  (`draft` | `sent_to_kitchen` | `served` | `bill_requested` | `paid` | `cancelled`), created_by,
  created_at.

Table `order_items`:
- id, order_id, menu_item_id, qty, unit_price (price snapshot at order time — never re-derive
  historical bills from a live price join), station, status (`draft` | `sent_to_kitchen` |
  `served` | `cancelled`).

**Lifecycle:** table opened → items added to draft order (repeatable) → send to kitchen (writes
KOT print job + fires stock deduction for those items) → more items can be added later in the same
session, each new batch repeats the send-to-kitchen step independently → bill requested → payment
recorded → table/session closed.

**Split bill:** an order can be split into N sub-bills at payment time, either by item or evenly;
each sub-bill records its own payment method(s) and printed receipt, but they all settle against
the same parent order.

**Merge / transfer table:** an open table_session can be reassigned to a different table (transfer)
or two open sessions can be merged into one order before billing (merge) — both are admin/manager
actions with an audit log entry (§7).

### 2.7 Rooms & folio
Table `room_categories`:
- id, name (e.g. "Standard", "Deluxe"), default_rate.

Table `rooms`:
- id, room_number, room_category_id, rate_override (nullable — if set, overrides the category's
  default_rate for this specific room), status (`vacant` | `occupied` | `maintenance`).

Effective nightly rate = `rooms.rate_override ?? room_categories.default_rate`.

Table `bookings`:
- id, room_id, guest_name, check_in, check_out, board_plan
  (`room_only` | `bed_breakfast` | `half_board` | `full_board`), agreed_rate (snapshot of the
  room's effective rate at booking time — don't let a later category price change alter an
  in-progress guest's rate).

Table `folio_charges` — every charge against a guest's stay, one running bill:
- id, booking_id, source (`room_service_order` | `restaurant_order` | `bar_order` | `room_rate` |
  `misc`), reference_id (nullable), amount, created_at.

At checkout, sum all `folio_charges` for the booking + nights × agreed_rate = final bill.
Guests may **also** settle an individual restaurant/bar order in cash on the spot instead of
charging it to the room — in that case the order is paid directly and never gets a `folio_charges`
row.

Board-plan meals: [DECIDE DURING BUILD — default to this] when a `full_board`/`half_board` guest
orders a covered meal via room service, the KOT still fires and stock still deducts normally, but
the `folio_charges` amount for that order is ₨0 (covered by `room_rate` already charged);
anything beyond the plan (extra dishes, bar drinks) charges normally.

### 2.8 Low-stock alerts & variance reporting (in scope for v1)
- `ingredients.reorder_level` breach → dashboard alert + optional notification hook.
- Variance report: for a date range, compare **theoretical consumption** (sum of recipe
  deductions from `stock_movements` reason=`sale`) vs **actual stock movement** (purchases −
  current stock delta) to surface wastage/pilferage. This is the highest-value report once BOM
  exists — build it early, not as an afterthought.

---

## 3. Printing

### 3.1 Customer bill
Triggered on payment / bill_requested → paid. Itemized lines, service charge, total, payment
method(s), split-bill reference if applicable. Queued in `print_jobs`, sent by local print-agent.

### 3.2 KOT
Triggered when order_items batch → `sent_to_kitchen`. No prices — table/room/takeaway reference,
item names, qty, notes, timestamp. Routed by `menu_items.station`:
- `kitchen` → kitchen printer
- `bar` → bar printer

[DECIDE DURING BUILD] if kitchen and bar are physically separate, assume two KOT printers; if
same pass-through area, one is fine — make the printer-to-station mapping a config setting, not
hardcoded, so this is a settings change rather than a code change either way.

### 3.3 Reliability
`print_jobs` retries on failure (exponential backoff, capped retries) and surfaces a "printer
offline" banner in the admin dashboard — a silently lost KOT means an unmade dish, this must be
loud, not silent.

---

## 4. BOM management (admin screen)
CRUD for ingredients, recipes (attach ingredients+qty to a menu item), suppliers, and purchase
orders / goods receiving (§2.2).

---

## 5. Admin dashboard
- Live table/room status board.
- Sales reports: by day, outlet, category, payment method.
- Inventory: current stock, low-stock alerts, purchase-vs-consumption variance report (§2.8).
- Void/cancellation log with reason + approver.
- User & role management.
- Printer health status (from §3.3).

---

## 6. Split-bill / merge-table
Covered in §2.6 as core scope, not a stretch item. Both actions require a manager/admin role
(§7) and write an audit log row.

---

## 7. Roles & permissions
Roles: `admin`, `cashier`, `waiter`, `bartender`, `kitchen_staff`, `room_service_staff`.

Permission matrix [DECIDE DURING BUILD exact matrix, default to]:

| Action | admin | cashier | waiter | bartender | kitchen | room_service |
|---|---|---|---|---|---|---|
| Take orders | Y | Y | Y | Y | - | Y |
| Send KOT | Y | Y | Y | Y | - | Y |
| Mark item served | Y | - | Y | Y | Y | Y |
| Request/print bill | Y | Y | Y | Y | - | Y |
| Take payment | Y | Y | - | - | - | - |
| Apply discount / price override | Y | PIN | - | - | - | - |
| Void order/item | Y | PIN | - | - | - | - |
| Split/merge table | Y | PIN | - | - | - | - |
| Edit BOM/recipes/prices | Y | - | - | - | - | - |
| Goods receiving | Y | Y (if assigned) | - | - | - | - |
| View admin dashboard/reports | Y | - | - | - | - | - |

"PIN" = the action is allowed for a non-admin role only after an admin/manager PIN confirmation —
gives frontline staff flexibility without losing the audit trail.

---

## 8. Discounts [in scope, lightweight v1]
Order-level or line-level % / flat discount, requires manager-PIN if applied by non-admin,
recorded with reason + who approved (feeds the void/discount audit log in §5).

---

## 9. Offline resilience
- **Order entry:** frontend queues new orders/order_items locally (IndexedDB) if the API is
  unreachable, and syncs on reconnect. Stock deduction and KOT printing only happen once the
  sync succeeds server-side — never deduct stock from an unsynced local draft.
- **Print agent:** runs on the local network regardless of internet status, so KOT/bill printing
  keeps working even if the wider internet is down, as long as the LAN and DB (if self-hosted
  locally) are up. If the DB is cloud-hosted, [DECIDE DURING BUILD] whether to add a local cache
  layer for the print agent — flag this to the owner if internet reliability is a known issue at
  the venue.
- Conflict handling: since this is single-outlet with a small number of terminals, last-write-wins
  with a visible "synced" indicator per order is sufficient for v1 — no need for CRDT-level
  merge logic.

---

## 10. Payment methods [DECIDE DURING BUILD — default to]
Cash, card, "charge to room" (writes a `folio_charges` row instead of a payment record). Split
payment across methods on one bill supported (§2.6).

---

## 11. Suggested build order (phased)
1. Core schema: ingredients, recipes, menu_items, prices, service_charge_rules.
2. Goods receiving + suppliers (so inventory can go up, not just down).
3. Order flow: draft → add items → send to kitchen (stock deduction + KOT print) → bill → pay
   (customer print), including split-bill.
4. Table management: open/close session, transfer, merge.
5. Room/booking/folio module, room categories + rate override.
6. Admin dashboard: inventory, low-stock alerts, variance report, sales reports, void/discount
   log.
7. Printer integration: print-agent service, KOT routing by station.
8. Roles/auth + manager-PIN override flow.
9. Offline queue + sync indicator.

---

## 12. Still worth confirming with the owner during UAT (not blocking build)
1. Whether bar dine-in really should have 0% service charge (unusual industry norm — spec said
   yes, worth a sanity check once they see it live).
2. Exact permission matrix in §7 — the table above is a sensible default, not a mandate.
3. Whether board-plan "covered" meals should print differently on the KOT (e.g. a "PACKAGE" tag)
   so kitchen staff can visually distinguish comped vs. paid room-service orders.
