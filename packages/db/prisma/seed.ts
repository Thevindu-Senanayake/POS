/**
 * Seed data for the Hospitality POS (spec §11 phase 0 + demo data for every flow).
 *
 * Creates one outlet, a user per role (with a manager PIN on the admin), suppliers,
 * ingredients with an opening-balance ledger movement, a menu spanning food / bar /
 * room-service — including "Whisky (Single)" and "Whisky (Double)" as *distinct*
 * items with their own recipes and per-channel prices (spec §2.4) — service-charge
 * rules, restaurant + bar tables, room categories + rooms (one with a rate override),
 * a sample checked-in booking, printers, and app settings.
 *
 * Idempotent: wipes the domain tables (reverse-dependency order) and re-inserts, so
 * `pnpm --filter @pos/db seed` can be run repeatedly.
 *
 * Dev credentials (documented in README): every user's password is `pos1234`;
 * the admin's manager PIN is `1234`.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'pos1234';
const ADMIN_PIN = '1234';
const BCRYPT_ROUNDS = 10;

type IngredientSeed = {
  name: string;
  baseUnit: 'g' | 'ml' | 'pcs';
  stock: number;
  reorder: number;
  cost: number; // cost per base unit (weighted average)
  supplier: string;
};

const SUPPLIERS = [
  { name: 'Metro Cash & Carry', contactInfo: 'Wholesale groceries', phone: '+92-300-1112222', email: 'orders@metro.example' },
  { name: 'Fresh Farm Produce', contactInfo: 'Meat & vegetables', phone: '+92-301-3334444', email: 'sales@freshfarm.example' },
  { name: 'City Beverages', contactInfo: 'Bar & soft drinks', phone: '+92-302-5556666', email: 'trade@citybev.example' },
];

const INGREDIENTS: IngredientSeed[] = [
  { name: 'Chicken Breast', baseUnit: 'g', stock: 40000, reorder: 5000, cost: 0.85, supplier: 'Fresh Farm Produce' },
  { name: 'Basmati Rice', baseUnit: 'g', stock: 60000, reorder: 8000, cost: 0.28, supplier: 'Metro Cash & Carry' },
  { name: 'Cooking Oil', baseUnit: 'ml', stock: 30000, reorder: 4000, cost: 0.42, supplier: 'Metro Cash & Carry' },
  { name: 'Onion', baseUnit: 'g', stock: 25000, reorder: 3000, cost: 0.12, supplier: 'Fresh Farm Produce' },
  { name: 'Tomato', baseUnit: 'g', stock: 20000, reorder: 3000, cost: 0.18, supplier: 'Fresh Farm Produce' },
  { name: 'Eggs', baseUnit: 'pcs', stock: 300, reorder: 60, cost: 22, supplier: 'Fresh Farm Produce' },
  { name: 'Bread Slice', baseUnit: 'pcs', stock: 200, reorder: 40, cost: 12, supplier: 'Metro Cash & Carry' },
  { name: 'Milk', baseUnit: 'ml', stock: 20000, reorder: 3000, cost: 0.22, supplier: 'Metro Cash & Carry' },
  // Deliberately below its reorder level so the low-stock alert has something to show.
  { name: 'Coffee Beans', baseUnit: 'g', stock: 600, reorder: 800, cost: 3.5, supplier: 'Metro Cash & Carry' },
  { name: 'Sugar', baseUnit: 'g', stock: 25000, reorder: 4000, cost: 0.15, supplier: 'Metro Cash & Carry' },
  // ~20 x 750ml bottles; sold by the ml so Single (30ml) and Double (60ml) deduct correctly.
  { name: 'Whisky', baseUnit: 'ml', stock: 15000, reorder: 3000, cost: 4.2, supplier: 'City Beverages' },
  { name: 'Cola Syrup', baseUnit: 'ml', stock: 18000, reorder: 3000, cost: 0.3, supplier: 'City Beverages' },
];

type MenuSeed = {
  name: string;
  category: 'food' | 'bar' | 'room_service';
  station: 'kitchen' | 'bar';
  prices: Partial<Record<'dine_in_restaurant' | 'dine_in_bar' | 'takeaway' | 'room_service', number>>;
  recipe: Array<[string, number]>; // [ingredient name, qty in base unit]
};

const MENU: MenuSeed[] = [
  {
    name: 'Chicken Biryani',
    category: 'food',
    station: 'kitchen',
    prices: { dine_in_restaurant: 850, dine_in_bar: 850, takeaway: 800, room_service: 950 },
    recipe: [['Basmati Rice', 250], ['Chicken Breast', 200], ['Cooking Oil', 30], ['Onion', 60], ['Tomato', 40]],
  },
  {
    name: 'Grilled Chicken Sandwich',
    category: 'food',
    station: 'kitchen',
    prices: { dine_in_restaurant: 650, dine_in_bar: 650, takeaway: 600, room_service: 750 },
    recipe: [['Bread Slice', 2], ['Chicken Breast', 150], ['Cooking Oil', 10]],
  },
  {
    name: 'Continental Breakfast',
    category: 'food',
    station: 'kitchen',
    prices: { dine_in_restaurant: 550, room_service: 650 },
    recipe: [['Eggs', 2], ['Bread Slice', 2], ['Milk', 100]],
  },
  {
    name: 'Coffee',
    category: 'food',
    station: 'kitchen',
    prices: { dine_in_restaurant: 250, dine_in_bar: 250, takeaway: 220, room_service: 300 },
    recipe: [['Coffee Beans', 15], ['Milk', 50], ['Sugar', 10]],
  },
  {
    name: 'Whisky (Single)',
    category: 'bar',
    station: 'bar',
    prices: { dine_in_bar: 500, dine_in_restaurant: 550, room_service: 650 },
    recipe: [['Whisky', 30]],
  },
  {
    name: 'Whisky (Double)',
    category: 'bar',
    station: 'bar',
    prices: { dine_in_bar: 900, dine_in_restaurant: 1000, room_service: 1150 },
    recipe: [['Whisky', 60]],
  },
  {
    name: 'Cola',
    category: 'bar',
    station: 'bar',
    prices: { dine_in_bar: 180, dine_in_restaurant: 200, takeaway: 150, room_service: 220 },
    recipe: [['Cola Syrup', 50]],
  },
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
  const supplierByName = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const created = await prisma.supplier.create({ data: s });
    supplierByName.set(s.name, created.id);
  }
  console.log(`Suppliers: ${SUPPLIERS.length}`);

  // --- Ingredients (+ opening-balance ledger movement) --------------------
  const ingredientByName = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    const created = await prisma.ingredient.create({
      data: {
        outletId: outlet.id,
        name: ing.name,
        baseUnit: ing.baseUnit,
        currentStock: ing.stock,
        reorderLevel: ing.reorder,
        costPerUnit: ing.cost,
        supplierId: supplierByName.get(ing.supplier) ?? null,
      },
    });
    ingredientByName.set(ing.name, created.id);
    // Opening balance in the append-only ledger so currentStock is reconcilable.
    await prisma.stockMovement.create({
      data: {
        ingredientId: created.id,
        changeQty: ing.stock,
        reason: 'adjustment',
        refType: 'manual',
        unitCostAtTime: ing.cost,
        note: 'Opening balance',
      },
    });
  }
  console.log(`Ingredients: ${INGREDIENTS.length} (each with an opening-balance movement)`);

  // --- Menu items, prices, recipes ----------------------------------------
  for (const m of MENU) {
    await prisma.menuItem.create({
      data: {
        outletId: outlet.id,
        name: m.name,
        category: m.category,
        station: m.station,
        prices: {
          create: Object.entries(m.prices).map(([channel, price]) => ({
            channel: channel as any,
            price: price as number,
          })),
        },
        recipes: {
          create: m.recipe.map(([ingName, qty]) => {
            const ingredientId = ingredientByName.get(ingName);
            if (!ingredientId) throw new Error(`Recipe references unknown ingredient: ${ingName}`);
            return { ingredientId, quantity: qty };
          }),
        },
      },
    });
  }
  console.log(`Menu items: ${MENU.length} (with per-channel prices + recipes)`);

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
  await prisma.printer.create({ data: { station: 'kitchen', name: 'Kitchen Printer', port: 9100, type: 'epson' } });
  await prisma.printer.create({ data: { station: 'bar', name: 'Bar Printer', port: 9100, type: 'epson' } });
  console.log('Printers: kitchen + bar');

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
