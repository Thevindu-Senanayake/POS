/**
 * Seed data for the Hospitality POS (spec §11 phase 0 + demo data for every flow).
 *
 * Creates one outlet, a user per role (with a manager PIN on the admin), suppliers,
 * and the venue's real catalog — Hotel KinTop's ingredients and menu — loaded from
 * `data/seed-data.json` (generated from the source workbooks by
 * `scripts/import-xlsx.py`; never hand-edit that file). That catalog covers spirits
 * sold by the ml (bottle barcodes + opening stock, with every pour size 25–750 ml as
 * its own priced item, spec §2.4), packaged bar items scanned by their own barcode,
 * and the kitchen dishes — each with per-channel prices and a recipe. It also seeds
 * service-charge rules, restaurant + bar tables, room categories + rooms (one with a
 * rate override), a sample checked-in booking, printers, and app settings.
 *
 * Idempotent: wipes the domain tables (reverse-dependency order) and re-inserts, so
 * `pnpm --filter @pos/db seed` can be run repeatedly.
 *
 * Dev credentials (documented in README): every user's password is `pos1234`;
 * the admin's manager PIN is `1234`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'pos1234';
const ADMIN_PIN = '1234';
const BCRYPT_ROUNDS = 10;

type Channel = 'dine_in_restaurant' | 'dine_in_bar' | 'takeaway' | 'room_service';

/** Shape of `data/seed-data.json` (produced by `scripts/import-xlsx.py`). */
type SeedData = {
  ingredients: Array<{
    name: string;
    baseUnit: 'g' | 'ml' | 'pcs';
    barcode: string | null;
    openingStock: number;
    reorderLevel: number;
    costPerUnit: number;
  }>;
  menuItems: Array<{
    name: string;
    category: 'food' | 'bar' | 'room_service';
    station: 'kitchen' | 'bar';
    menuGroup: string | null;
    barcode: string | null;
    prices: Array<{ channel: Channel; price: number }>;
    recipe: Array<{ ingredient: string; quantity: number }>;
  }>;
};

/** Load the generated catalog, resolved relative to this file (CWD-independent). */
function loadSeedData(): SeedData {
  const dir =
    typeof __dirname !== 'undefined' ? join(__dirname, '..', 'data') : join(process.cwd(), 'data');
  return JSON.parse(readFileSync(join(dir, 'seed-data.json'), 'utf8')) as SeedData;
}

const SUPPLIERS = [
  { name: 'Metro Cash & Carry', contactInfo: 'Wholesale groceries', phone: '+92-300-1112222', email: 'orders@metro.example' },
  { name: 'Fresh Farm Produce', contactInfo: 'Meat & vegetables', phone: '+92-301-3334444', email: 'sales@freshfarm.example' },
  { name: 'City Beverages', contactInfo: 'Bar & soft drinks', phone: '+92-302-5556666', email: 'trade@citybev.example' },
];

const SERVICE_CHARGE: Array<['dine_in_restaurant' | 'dine_in_bar' | 'takeaway' | 'room_service', number]> = [
  ['dine_in_restaurant', 10],
  ['dine_in_bar', 0], // spec §2.5 — bar dine-in is 0%
  ['takeaway', 0], // spec §2.5 — takeaway is 0%
  ['room_service', 0], // billed to folio; service assumed in room rate (owner-configurable)
];

const USERS = [
  { username: 'admin', name: 'Alice Admin', role: 'admin' as const, pin: ADMIN_PIN },
  { username: 'cashier', name: 'Cathy Cashier', role: 'cashier' as const },
  { username: 'waiter', name: 'Wasim Waiter', role: 'waiter' as const },
  { username: 'bartender', name: 'Bilal Bartender', role: 'bartender' as const },
  { username: 'kitchen', name: 'Karim Kitchen', role: 'kitchen_staff' as const },
  { username: 'roomservice', name: 'Rana RoomService', role: 'room_service_staff' as const },
];

async function reset() {
  // Reverse-dependency order so FKs never block the wipe.
  await prisma.auditLog.deleteMany();
  await prisma.folioCharge.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.tableSession.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomCategory.deleteMany();
  await prisma.printJob.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.menuItemPrice.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.serviceChargeRule.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.outlet.deleteMany();
}

async function main() {
  // Load (and validate the presence of) the generated catalog before the wipe,
  // so a missing/corrupt seed-data.json aborts without destroying existing data.
  const seedData = loadSeedData();
  console.log(
    `Loaded catalog: ${seedData.ingredients.length} ingredients, ${seedData.menuItems.length} menu items.`,
  );
  console.log('Seeding — wiping existing data...');
  await reset();

  // --- Outlet -------------------------------------------------------------
  const outlet = await prisma.outlet.create({
    data: {
      name: 'The Grand Hospitality',
      address: '1 Mall Road',
      phone: '+92-42-111-000-111',
    },
  });
  console.log(`Outlet: ${outlet.name}`);

  // --- Users --------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  for (const u of USERS) {
    await prisma.user.create({
      data: {
        outletId: outlet.id,
        name: u.name,
        username: u.username,
        passwordHash,
        role: u.role,
        pinHash: u.pin ? await bcrypt.hash(u.pin, BCRYPT_ROUNDS) : null,
      },
    });
  }
  console.log(`Users: ${USERS.length} (password "${DEV_PASSWORD}", admin PIN "${ADMIN_PIN}")`);

  // --- Suppliers ----------------------------------------------------------
  // Kept for the purchasing / goods-receiving flow. The imported ingredients
  // are not pre-linked to a supplier — cost is established later on receiving.
  for (const s of SUPPLIERS) {
    await prisma.supplier.create({ data: s });
  }
  console.log(`Suppliers: ${SUPPLIERS.length}`);

  // --- Ingredients (+ opening-balance ledger movement) --------------------
  const ingredientByName = new Map<string, string>();
  let openingMovements = 0;
  for (const ing of seedData.ingredients) {
    const created = await prisma.ingredient.create({
      data: {
        outletId: outlet.id,
        name: ing.name,
        baseUnit: ing.baseUnit,
        barcode: ing.barcode, // spirit bottles carry the scannable barcode
        currentStock: ing.openingStock,
        reorderLevel: ing.reorderLevel,
        costPerUnit: ing.costPerUnit,
      },
    });
    ingredientByName.set(ing.name, created.id);
    // Opening balance in the append-only ledger so currentStock is reconcilable.
    // Kitchen ingredients start empty (0) — nothing to record.
    if (ing.openingStock !== 0) {
      await prisma.stockMovement.create({
        data: {
          ingredientId: created.id,
          changeQty: ing.openingStock,
          reason: 'adjustment',
          refType: 'manual',
          unitCostAtTime: ing.costPerUnit,
          note: 'Opening balance',
        },
      });
      openingMovements += 1;
    }
  }
  console.log(
    `Ingredients: ${seedData.ingredients.length} (${openingMovements} with an opening-balance movement)`,
  );

  // --- Menu items, prices, recipes ----------------------------------------
  for (const m of seedData.menuItems) {
    await prisma.menuItem.create({
      data: {
        outletId: outlet.id,
        name: m.name,
        category: m.category,
        menuGroup: m.menuGroup, // fine section (e.g. Arrack / Fried Rice)
        barcode: m.barcode, // set on packaged whole-unit bar items (beer/cans)
        station: m.station,
        prices: {
          create: m.prices.map((p) => ({ channel: p.channel, price: p.price })),
        },
        recipes: {
          create: m.recipe.map((r) => {
            const ingredientId = ingredientByName.get(r.ingredient);
            if (!ingredientId) throw new Error(`Recipe references unknown ingredient: ${r.ingredient}`);
            return { ingredientId, quantity: r.quantity };
          }),
        },
      },
    });
  }
  const recipeRows = seedData.menuItems.reduce((n, m) => n + m.recipe.length, 0);
  console.log(
    `Menu items: ${seedData.menuItems.length} (with per-channel prices + ${recipeRows} recipe rows)`,
  );

  // --- Service-charge rules ------------------------------------------------
  for (const [channel, pct] of SERVICE_CHARGE) {
    await prisma.serviceChargeRule.create({ data: { channel, percentage: pct } });
  }
  console.log(`Service-charge rules: ${SERVICE_CHARGE.length}`);

  // --- Tables --------------------------------------------------------------
  const tables = [
    { area: 'restaurant' as const, name: 'R1', capacity: 2 },
    { area: 'restaurant' as const, name: 'R2', capacity: 2 },
    { area: 'restaurant' as const, name: 'R3', capacity: 4 },
    { area: 'restaurant' as const, name: 'R4', capacity: 4 },
    { area: 'restaurant' as const, name: 'R5', capacity: 6 },
    { area: 'restaurant' as const, name: 'R6', capacity: 2 },
    { area: 'bar' as const, name: 'B1', capacity: 2 },
    { area: 'bar' as const, name: 'B2', capacity: 2 },
    { area: 'bar' as const, name: 'B3', capacity: 4 },
    { area: 'bar' as const, name: 'B4', capacity: 2 },
  ];
  for (const t of tables) {
    await prisma.diningTable.create({ data: { outletId: outlet.id, ...t } });
  }
  console.log(`Tables: ${tables.length} (restaurant + bar)`);

  // --- Room categories + rooms --------------------------------------------
  const standard = await prisma.roomCategory.create({ data: { name: 'Standard', defaultRate: 8000 } });
  const deluxe = await prisma.roomCategory.create({ data: { name: 'Deluxe', defaultRate: 12000 } });
  const suite = await prisma.roomCategory.create({ data: { name: 'Suite', defaultRate: 20000 } });

  const rooms = [
    { roomNumber: '101', roomCategoryId: standard.id, rateOverride: null as number | null },
    { roomNumber: '102', roomCategoryId: standard.id, rateOverride: null },
    { roomNumber: '201', roomCategoryId: deluxe.id, rateOverride: 13000 }, // per-room override (spec §2.7)
    { roomNumber: '202', roomCategoryId: deluxe.id, rateOverride: null },
    { roomNumber: '301', roomCategoryId: suite.id, rateOverride: null },
  ];
  const roomByNumber = new Map<string, string>();
  for (const r of rooms) {
    const created = await prisma.room.create({
      data: {
        outletId: outlet.id,
        roomNumber: r.roomNumber,
        roomCategoryId: r.roomCategoryId,
        rateOverride: r.rateOverride,
      },
    });
    roomByNumber.set(r.roomNumber, created.id);
  }
  console.log(`Rooms: ${rooms.length} across 3 categories`);

  // --- Sample checked-in booking (room 201, half-board) -------------------
  const checkIn = new Date();
  checkIn.setHours(14, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  const room201 = roomByNumber.get('201')!;
  await prisma.booking.create({
    data: {
      roomId: room201,
      guestName: 'John Guest',
      guestPhone: '+92-333-9998888',
      checkIn,
      checkOut,
      boardPlan: 'half_board',
      agreedRate: 13000, // snapshot of room 201's effective (overridden) rate
      status: 'checked_in',
    },
  });
  await prisma.room.update({ where: { id: room201 }, data: { status: 'occupied' } });
  console.log('Booking: John Guest in room 201 (half-board, checked-in)');

  // --- Printers ------------------------------------------------------------
  // KOTs print over the network (kitchen + bar); the customer bill/receipt
  // prints on the USB printer attached to the till host (spec §3.2).
  await prisma.printer.create({
    data: { role: 'kitchen', name: 'Kitchen Printer', connection: 'network', port: 9100, type: 'epson' },
  });
  await prisma.printer.create({
    data: { role: 'bar', name: 'Bar Printer', connection: 'network', port: 9100, type: 'epson' },
  });
  await prisma.printer.create({
    data: { role: 'receipt', name: 'Receipt Printer', connection: 'usb', device: 'Receipt Printer', type: 'epson' },
  });
  console.log('Printers: kitchen + bar (network) + receipt (USB)');

  // --- App settings --------------------------------------------------------
  const settings: Array<[string, unknown]> = [
    ['currency', { symbol: '₨', code: 'PKR' }],
    ['service_charge_in_room_rate', false],
    ['low_stock_warn_only', true], // low stock warns but does not block sending to kitchen
    ['kot_package_tag', true], // print a "PACKAGE" tag on comped board-plan KOTs (owner UAT item)
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.create({ data: { key, value: value as any } });
  }
  console.log(`App settings: ${settings.length}`);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
