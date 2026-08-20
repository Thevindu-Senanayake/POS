import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  BillDTO,
  BookingDTO,
  DiningTableDTO,
  IngredientDTO,
  LoginResponseDTO,
  MenuItemDTO,
  OrderDTO,
  PrintJobDTO,
  StockMovementDTO,
  TableSessionDTO,
} from '@pos/shared';
import { round2 } from '@pos/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * End-to-end critical-path coverage against a real seeded Postgres (spec §11).
 * Boots the full Nest app (global prefix + pipe + filter, exactly as main.ts) and
 * drives the money/stock flows over HTTP as the seeded admin:
 *   1. login → open table → order → send (assert StockMovement + KOT PrintJob) →
 *      pay → order paid, session closed, table needs_cleaning.
 *   2. board-plan comp → ₨0 folio charge (spec §2.7).
 *   3. cancel after send → deducted stock fully restored (spec §2, void/return).
 *
 * Each run provisions its own tables, so it is repeatable without re-seeding
 * (it only requires the seed's menu/ingredients/booking to exist).
 */
describe('POS critical path (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const bearer = () => `Bearer ${token}`;
  const server = () => app.getHttpServer();

  // A real seeded kitchen dish and one of its recipe ingredients, used to assert
  // stock deduction. Sausage Fried Rice → 330 g Rice (+ egg + sausage) and is
  // priced on dine_in_restaurant, so the 10% service-charge assertion holds.
  const DISH_NAME = 'Sausage Fried Rice';
  const DISH_INGREDIENT = 'Rice';
  const DISH_INGREDIENT_QTY = 330; // g of Rice deducted per dish

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts so validation/serialization behave identically to production.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const res = await request(server())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'pos1234' })
      .expect(200);
    token = (res.body as LoginResponseDTO).accessToken;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function findMenuItem(predicate: (m: MenuItemDTO) => boolean): Promise<MenuItemDTO> {
    const res = await request(server()).get('/api/menu-items').set('Authorization', bearer()).expect(200);
    const item = (res.body as MenuItemDTO[]).find(predicate);
    expect(item).toBeDefined();
    return item as MenuItemDTO;
  }

  async function findIngredient(name: string): Promise<IngredientDTO> {
    const res = await request(server()).get('/api/ingredients').set('Authorization', bearer()).expect(200);
    const ing = (res.body as IngredientDTO[]).find((i) => i.name === name);
    expect(ing).toBeDefined();
    return ing as IngredientDTO;
  }

  async function stockOf(id: string): Promise<number> {
    const res = await request(server()).get(`/api/ingredients/${id}`).set('Authorization', bearer()).expect(200);
    return (res.body as IngredientDTO).currentStock;
  }

  it('login → open table → send (stock + KOT) → pay → session closed', async () => {
    // A dedicated restaurant table so the run doesn't collide with seed state.
    const table = (
      await request(server())
        .post('/api/tables')
        .set('Authorization', bearer())
        .send({ area: 'restaurant', name: `E2E-${Date.now()}`, capacity: 4 })
        .expect(201)
    ).body as DiningTableDTO;
    expect(table.status).toBe('free');

    const session = (
      await request(server())
        .post(`/api/tables/${table.id}/session`)
        .set('Authorization', bearer())
        .send({})
        .expect(201)
    ).body as TableSessionDTO;

    const dish = await findMenuItem((m) => m.name === DISH_NAME);
    const restPrice = dish.prices.find((p) => p.channel === 'dine_in_restaurant');
    expect(restPrice).toBeDefined();

    const ingredient = await findIngredient(DISH_INGREDIENT);
    const stockBefore = await stockOf(ingredient.id);

    // Draft order with one dish.
    let order = (
      await request(server())
        .post('/api/orders')
        .set('Authorization', bearer())
        .send({
          channel: 'dine_in_restaurant',
          tableSessionId: session.id,
          items: [{ menuItemId: dish.id, qty: 1 }],
        })
        .expect(201)
    ).body as OrderDTO;
    expect(order.status).toBe('draft');
    expect(order.items).toHaveLength(1);

    // Send to kitchen — the only point stock is deducted and the KOT is enqueued.
    order = (
      await request(server())
        .post(`/api/orders/${order.id}/send`)
        .set('Authorization', bearer())
        .send({})
        .expect(201)
    ).body as OrderDTO;
    expect(order.status).toBe('sent_to_kitchen');
    expect(order.items[0].status).toBe('sent_to_kitchen');

    // Stock deducted by the recipe qty (Sausage Fried Rice → 330 g Rice).
    expect(await stockOf(ingredient.id)).toBeCloseTo(stockBefore - DISH_INGREDIENT_QTY, 5);

    // A `sale` StockMovement was written against an order item.
    const moves = (
      await request(server())
        .get(`/api/ingredients/${ingredient.id}/movements`)
        .set('Authorization', bearer())
        .expect(200)
    ).body as StockMovementDTO[];
    const sale = moves.find((m) => m.reason === 'sale' && m.refType === 'order_item');
    expect(sale).toBeDefined();
    expect(sale!.changeQty).toBeCloseTo(-DISH_INGREDIENT_QTY, 5);

    // A KOT print job was enqueued for this order.
    const jobs = (
      await request(server()).get('/api/printing/jobs').set('Authorization', bearer()).expect(200)
    ).body as PrintJobDTO[];
    expect(jobs.some((j) => j.orderId === order.id && j.type === 'kot')).toBe(true);

    // Restaurant carries a 10% service charge → total = price × 1.10.
    expect(order.total).toBeCloseTo(round2(restPrice!.price * 1.1), 2);

    // Pay the full total in cash.
    const bill = (
      await request(server())
        .post(`/api/orders/${order.id}/pay`)
        .set('Authorization', bearer())
        .send({ payments: [{ method: 'cash', amount: order.total }] })
        .expect(201)
    ).body as BillDTO;
    expect(bill.total).toBeCloseTo(order.total, 2);
    expect(bill.payments).toHaveLength(1);

    // Order is paid…
    const paid = (
      await request(server()).get(`/api/orders/${order.id}`).set('Authorization', bearer()).expect(200)
    ).body as OrderDTO;
    expect(paid.status).toBe('paid');

    // …session closed and the table flipped to needs_cleaning.
    const tableAfter = (
      await request(server()).get(`/api/tables/${table.id}`).set('Authorization', bearer()).expect(200)
    ).body as DiningTableDTO;
    expect(tableAfter.status).toBe('needs_cleaning');
    expect(tableAfter.activeSessionId).toBeNull();
  });

  it('board-plan comp posts a ₨0 folio charge (spec §2.7)', async () => {
    const bookings = (
      await request(server()).get('/api/bookings').set('Authorization', bearer()).expect(200)
    ).body as BookingDTO[];
    const booking = bookings.find(
      (b) => b.boardPlan === 'half_board' || b.boardPlan === 'full_board',
    );
    expect(booking).toBeDefined();
    const folioTotalBefore = booking!.folioTotal;

    const item = await findMenuItem((m) => m.prices.some((p) => p.channel === 'room_service'));

    const order = (
      await request(server())
        .post('/api/orders')
        .set('Authorization', bearer())
        .send({ channel: 'room_service', bookingId: booking!.id, items: [{ menuItemId: item.id, qty: 1 }] })
        .expect(201)
    ).body as OrderDTO;

    await request(server())
      .post(`/api/orders/${order.id}/send`)
      .set('Authorization', bearer())
      .send({})
      .expect(201);

    // Covered board-plan meal: KOT/stock fired, but the folio amount is ₨0.
    await request(server())
      .post(`/api/orders/${order.id}/charge-to-room`)
      .set('Authorization', bearer())
      .send({ comp: true })
      .expect(201);

    const after = (
      await request(server())
        .get(`/api/bookings/${booking!.id}`)
        .set('Authorization', bearer())
        .expect(200)
    ).body as BookingDTO;
    // Folio total unchanged because the posted charge is ₨0.
    expect(after.folioTotal).toBeCloseTo(folioTotalBefore, 2);
    expect(after.folioCharges.some((c) => c.amount === 0)).toBe(true);
  });

  it('cancelling a sent order restores the deducted stock (spec §2)', async () => {
    const table = (
      await request(server())
        .post('/api/tables')
        .set('Authorization', bearer())
        .send({ area: 'restaurant', name: `E2E-C-${Date.now()}`, capacity: 2 })
        .expect(201)
    ).body as DiningTableDTO;
    const session = (
      await request(server())
        .post(`/api/tables/${table.id}/session`)
        .set('Authorization', bearer())
        .send({})
        .expect(201)
    ).body as TableSessionDTO;

    const dish = await findMenuItem((m) => m.name === DISH_NAME);
    const ingredient = await findIngredient(DISH_INGREDIENT);
    const before = await stockOf(ingredient.id);

    const order = (
      await request(server())
        .post('/api/orders')
        .set('Authorization', bearer())
        .send({
          channel: 'dine_in_restaurant',
          tableSessionId: session.id,
          items: [{ menuItemId: dish.id, qty: 2 }],
        })
        .expect(201)
    ).body as OrderDTO;

    await request(server())
      .post(`/api/orders/${order.id}/send`)
      .set('Authorization', bearer())
      .send({})
      .expect(201);
    // 2 × 330 g deducted.
    expect(await stockOf(ingredient.id)).toBeCloseTo(before - 2 * DISH_INGREDIENT_QTY, 5);

    await request(server())
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', bearer())
      .send({ reason: 'e2e reversal' })
      .expect(201);

    // Reversing movements restore the ingredient to its pre-send level.
    expect(await stockOf(ingredient.id)).toBeCloseTo(before, 5);
    const cancelled = (
      await request(server()).get(`/api/orders/${order.id}`).set('Authorization', bearer()).expect(200)
    ).body as OrderDTO;
    expect(cancelled.status).toBe('cancelled');
  });

  it('voiding lines frees the table only when the last line goes (Fix #1)', async () => {
    const table = (
      await request(server())
        .post('/api/tables')
        .set('Authorization', bearer())
        .send({ area: 'restaurant', name: `E2E-V-${Date.now()}`, capacity: 2 })
        .expect(201)
    ).body as DiningTableDTO;
    expect(table.status).toBe('free');

    // Opening a session seats the table (occupied).
    const session = (
      await request(server())
        .post(`/api/tables/${table.id}/session`)
        .set('Authorization', bearer())
        .send({})
        .expect(201)
    ).body as TableSessionDTO;
    const seated = (
      await request(server()).get(`/api/tables/${table.id}`).set('Authorization', bearer()).expect(200)
    ).body as DiningTableDTO;
    expect(seated.status).toBe('occupied');

    // Two distinct restaurant lines so we can void one and keep the table seated.
    const dish1 = await findMenuItem((m) => m.name === DISH_NAME);
    const dish2 = await findMenuItem(
      (m) => m.name !== DISH_NAME && m.prices.some((p) => p.channel === 'dine_in_restaurant'),
    );
    const ingredient = await findIngredient(DISH_INGREDIENT);
    const before = await stockOf(ingredient.id);

    let order = (
      await request(server())
        .post('/api/orders')
        .set('Authorization', bearer())
        .send({
          channel: 'dine_in_restaurant',
          tableSessionId: session.id,
          items: [
            { menuItemId: dish1.id, qty: 1 },
            { menuItemId: dish2.id, qty: 1 },
          ],
        })
        .expect(201)
    ).body as OrderDTO;
    order = (
      await request(server())
        .post(`/api/orders/${order.id}/send`)
        .set('Authorization', bearer())
        .send({})
        .expect(201)
    ).body as OrderDTO;
    expect(order.items).toHaveLength(2);

    // Void the first line: a live line remains, so the table stays seated.
    await request(server())
      .post(`/api/orders/${order.id}/items/${order.items[0].id}/void`)
      .set('Authorization', bearer())
      .send({ reason: 'e2e partial void' })
      .expect(201);
    const midTable = (
      await request(server()).get(`/api/tables/${table.id}`).set('Authorization', bearer()).expect(200)
    ).body as DiningTableDTO;
    expect(midTable.status).toBe('occupied');
    expect(midTable.activeSessionId).toBe(session.id);

    // Void the remaining line: nothing live and nothing paid → back to free.
    await request(server())
      .post(`/api/orders/${order.id}/items/${order.items[1].id}/void`)
      .set('Authorization', bearer())
      .send({ reason: 'e2e final void' })
      .expect(201);

    // The emptied order is cancelled and its session closed.
    const afterOrder = (
      await request(server()).get(`/api/orders/${order.id}`).set('Authorization', bearer()).expect(200)
    ).body as OrderDTO;
    expect(afterOrder.status).toBe('cancelled');

    const freed = (
      await request(server()).get(`/api/tables/${table.id}`).set('Authorization', bearer()).expect(200)
    ).body as DiningTableDTO;
    expect(freed.status).toBe('free');
    expect(freed.activeSessionId).toBeNull();

    // Both voids fully restored the deducted stock.
    expect(await stockOf(ingredient.id)).toBeCloseTo(before, 5);
  });
});
