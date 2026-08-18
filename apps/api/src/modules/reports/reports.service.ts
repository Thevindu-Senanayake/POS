import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type {
  AuditAction,
  AuditLogDTO,
  DashboardSummaryDTO,
  LowStockRowDTO,
  OrderStatus,
  SalesReportDTO,
  SalesReportRowDTO,
} from '@pos/shared';
import type { VarianceRowDTO } from '@pos/shared';
import { AuditActionSchema, round2 } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const SALES_GROUP_BY = ['day', 'category', 'payment_method', 'channel'] as const;
type SalesGroupBy = (typeof SALES_GROUP_BY)[number];

/** Orders that are live on the floor (stock deducted, not yet settled/cancelled). */
const OPEN_ORDER_STATUSES: OrderStatus[] = ['sent_to_kitchen', 'served', 'bill_requested'];

/** Default sales/variance window when no range is given: the trailing 30 days. */
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const BILL_INCLUDE = {
  order: { select: { channel: true } },
  items: {
    include: { orderItem: { select: { menuItem: { select: { category: true } } } } },
  },
  payments: { select: { method: true, amount: true } },
} satisfies Prisma.BillInclude;

type BillForReport = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

/**
 * Reporting & analytics (spec §5, §2.8). All reads, admin-only at the controller.
 * Money is summed from the settled `Bill`/`Payment` rows (the source of truth for
 * revenue) and stock from the append-only `StockMovement` ledger. Date ranges are
 * interpreted in UTC (a single-outlet simplification); a date-only `to` covers the
 * whole of that day. The dashboard's "today" uses the server's local day boundary,
 * which for an on-site server is the venue's own day.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Sales -------------------------------------------------------------

  async salesReport(opts: {
    from?: string;
    to?: string;
    groupBy?: string;
  }): Promise<SalesReportDTO> {
    const { from, to } = this.resolveRange(opts.from, opts.to);
    const groupBy = this.parseGroupBy(opts.groupBy);

    const bills = await this.prisma.bill.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: BILL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    // Grand totals always use the accurate bill-level decomposition, regardless
    // of how the rows are grouped (a category/payment split can't attribute
    // order-level discounts & service charge, so its rows carry less detail).
    const totals = { orders: 0, gross: 0, discounts: 0, serviceCharge: 0, net: 0 };
    for (const b of bills) {
      totals.orders += 1;
      totals.gross += decToNum(b.subtotal);
      totals.discounts += decToNum(b.discountTotal);
      totals.serviceCharge += decToNum(b.serviceCharge);
      totals.net += decToNum(b.total);
    }
    this.roundMoney(totals);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy,
      rows: this.buildSalesRows(bills, groupBy),
      totals,
    };
  }

  private buildSalesRows(bills: BillForReport[], groupBy: SalesGroupBy): SalesReportRowDTO[] {
    const rows = new Map<string, SalesReportRowDTO>();
    const row = (key: string): SalesReportRowDTO => {
      const existing = rows.get(key);
      if (existing) return existing;
      const fresh = this.emptyRow(key);
      rows.set(key, fresh);
      return fresh;
    };

    if (groupBy === 'day' || groupBy === 'channel') {
      // Full decomposition: gross=subtotal, net=total (=gross−discounts+SC).
      for (const b of bills) {
        const key = groupBy === 'day' ? b.createdAt.toISOString().slice(0, 10) : b.order.channel;
        const r = row(key);
        r.orders += 1;
        r.gross += decToNum(b.subtotal);
        r.discounts += decToNum(b.discountTotal);
        r.serviceCharge += decToNum(b.serviceCharge);
        r.net += decToNum(b.total);
      }
    } else if (groupBy === 'payment_method') {
      // Money collected by tender. Charge-to-room settlements take no Payment
      // (they hit the folio), so they don't appear here — that's intended.
      for (const b of bills) {
        for (const p of b.payments) {
          const r = row(p.method);
          const amt = decToNum(p.amount);
          r.orders += 1; // payments (tenders) of this method
          r.gross += amt;
          r.net += amt;
        }
      }
    } else {
      // category: gross from line totals; discounts/SC not attributable per line.
      const billsPerKey = new Map<string, Set<string>>();
      for (const b of bills) {
        for (const it of b.items) {
          const key = it.orderItem?.menuItem.category ?? 'uncategorized';
          const r = row(key);
          const amt = decToNum(it.lineTotal);
          r.gross += amt;
          r.net += amt;
          const seen = billsPerKey.get(key) ?? new Set<string>();
          seen.add(b.id);
          billsPerKey.set(key, seen);
        }
      }
      for (const [key, seen] of billsPerKey) row(key).orders = seen.size;
    }

    const out = [...rows.values()];
    for (const r of out) this.roundMoney(r);
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }

  // --- Inventory variance (spec §2.8) ------------------------------------

  /**
   * Per ingredient over the window: what was purchased, what recipes say should
   * have been consumed for the sales rung up (theoretical), and what physically
   * left inventory (actual = opening + purchases − closing, derived from the
   * ledger). Variance = actual − theoretical: positive means more was used than
   * the recipes explain (wastage, over-portioning, shrinkage revealed by a stock
   * count), valued at the ingredient's current cost.
   */
  async varianceReport(opts: { from?: string; to?: string }): Promise<VarianceRowDTO[]> {
    const { from, to } = this.resolveRange(opts.from, opts.to);

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['ingredientId', 'reason'],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { changeQty: true },
    });
    if (grouped.length === 0) return [];

    // purchase = goods received; saleReturn = net recipe deductions (sale is
    // negative, return positive); net = change across ALL reasons over the
    // window (= closing − opening), so actual usage = purchase − net.
    type Agg = { purchase: number; saleReturn: number; net: number };
    const agg = new Map<string, Agg>();
    for (const g of grouped) {
      const sum = g._sum.changeQty ? decToNum(g._sum.changeQty) : 0;
      const a = agg.get(g.ingredientId) ?? { purchase: 0, saleReturn: 0, net: 0 };
      a.net += sum;
      if (g.reason === 'purchase') a.purchase += sum;
      if (g.reason === 'sale' || g.reason === 'return') a.saleReturn += sum;
      agg.set(g.ingredientId, a);
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: [...agg.keys()] } },
    });
    const byId = new Map(ingredients.map((i) => [i.id, i]));

    const rows: VarianceRowDTO[] = [];
    for (const [ingredientId, a] of agg) {
      const ing = byId.get(ingredientId);
      if (!ing) continue;
      const purchased = round2(a.purchase);
      const theoretical = round2(-a.saleReturn);
      const actual = round2(a.purchase - a.net);
      const variance = round2(actual - theoretical);
      rows.push({
        ingredientId,
        ingredientName: ing.name,
        baseUnit: ing.baseUnit,
        purchased,
        theoreticalConsumption: theoretical,
        actualConsumption: actual,
        variance,
        varianceCost: round2(variance * decToNum(ing.costPerUnit)),
      });
    }
    // Biggest money leaks first.
    rows.sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost));
    return rows;
  }

  // --- Low stock ---------------------------------------------------------

  async lowStockReport(): Promise<LowStockRowDTO[]> {
    const rows = await this.prisma.ingredient.findMany({
      where: { isActive: true, reorderLevel: { gt: 0 } },
      orderBy: { name: 'asc' },
    });
    return rows
      .map((r) => {
        const currentStock = decToNum(r.currentStock);
        const reorderLevel = decToNum(r.reorderLevel);
        return {
          ingredientId: r.id,
          ingredientName: r.name,
          baseUnit: r.baseUnit,
          currentStock,
          reorderLevel,
          shortfall: round2(Math.max(reorderLevel - currentStock, 0)),
        };
      })
      .filter((r) => r.currentStock <= r.reorderLevel)
      .sort((a, b) => b.shortfall - a.shortfall);
  }

  // --- Dashboard ---------------------------------------------------------

  async dashboard(): Promise<DashboardSummaryDTO> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [
      tablesOccupied,
      tablesFree,
      roomsOccupied,
      roomsVacant,
      openOrders,
      salesAgg,
      lowStock,
      printersOffline,
    ] = await Promise.all([
      this.prisma.diningTable.count({ where: { status: 'occupied' } }),
      this.prisma.diningTable.count({ where: { status: 'free' } }),
      this.prisma.room.count({ where: { status: 'occupied' } }),
      this.prisma.room.count({ where: { status: 'vacant' } }),
      this.prisma.order.count({ where: { status: { in: OPEN_ORDER_STATUSES } } }),
      this.prisma.bill.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: startOfToday } },
      }),
      this.lowStockReport(),
      this.prisma.printer.count({ where: { online: false } }),
    ]);

    return {
      tablesOccupied,
      tablesFree,
      roomsOccupied,
      roomsVacant,
      openOrders,
      salesToday: salesAgg._sum.total ? round2(decToNum(salesAgg._sum.total)) : 0,
      lowStockCount: lowStock.length,
      printersOffline,
    };
  }

  // --- Audit trail -------------------------------------------------------

  async auditLog(opts: { action?: string; limit?: number }): Promise<AuditLogDTO[]> {
    const action = opts.action ? this.parseAction(opts.action) : undefined;
    return this.audit.list({ action, limit: opts.limit });
  }

  // --- Helpers -----------------------------------------------------------

  private resolveRange(from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getTime() - DEFAULT_WINDOW_MS);
    const toDate = to ? this.parseEndOfRange(to) : now;
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid `from`/`to` date');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    return { from: fromDate, to: toDate };
  }

  /** A date-only `to` (YYYY-MM-DD) means "through the end of that day" (UTC). */
  private parseEndOfRange(to: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : new Date(to);
  }

  private parseGroupBy(value?: string): SalesGroupBy {
    if (!value) return 'day';
    if ((SALES_GROUP_BY as readonly string[]).includes(value)) return value as SalesGroupBy;
    throw new BadRequestException(`groupBy must be one of: ${SALES_GROUP_BY.join(', ')}`);
  }

  private parseAction(value: string): AuditAction {
    const parsed = AuditActionSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(`Unknown audit action "${value}"`);
    return parsed.data;
  }

  private emptyRow(key: string): SalesReportRowDTO {
    return { key, orders: 0, gross: 0, discounts: 0, serviceCharge: 0, net: 0 };
  }

  private roundMoney(row: { gross: number; discounts: number; serviceCharge: number; net: number }): void {
    row.gross = round2(row.gross);
    row.discounts = round2(row.discounts);
    row.serviceCharge = round2(row.serviceCharge);
    row.net = round2(row.net);
  }
}
