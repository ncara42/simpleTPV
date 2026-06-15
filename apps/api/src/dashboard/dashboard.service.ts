import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@simpletpv/db';

import { num } from '../common/money.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { type TxClient, withTenantTx } from '../prisma/with-tenant-tx.js';
import type { DashboardPeriodQueryDto, ProductRankingsQueryDto } from './dashboard.dto.js';
import {
  type CompareMode,
  comparisonStarts,
  type DateRange,
  deltaPct,
  resolvePeriod,
} from './period.js';

// Fragmento SQL vacío para componer el filtro opcional de tienda sin condicionar
// la query (Prisma.empty se interpola a "nada").
const EMPTY = Prisma.empty;

@Injectable()
export class DashboardService {
  constructor(@Inject(PRISMA_BASE) private readonly base: PrismaService) {}

  // `now` se inyecta como `new Date()` aquí (frontera con el reloj). El resto de
  // la cadena de cálculo es pura y testeable.
  private now(): Date {
    return new Date();
  }

  // Resuelve el rango del periodo a partir del DTO. Centraliza la validación de custom.
  private rangeFor(q: DashboardPeriodQueryDto): DateRange {
    return resolvePeriod(q.period ?? 'today', this.now(), { from: q.from, to: q.to });
  }

  // Comparativa de ventas por tienda + total org, con delta %. No usa el selector
  // de periodo: compara el periodo en curso (día/mes/año según `compare`) contra
  // el anterior equivalente A LA MISMA ALTURA (STAT-01): el actual hasta AHORA y
  // el anterior hasta el mismo tiempo transcurrido. Compararse contra un periodo
  // ya cerrado haría que el en curso saliera siempre peor. `now` es inyectable
  // para tests deterministas (en runtime usa el reloj real).
  // Los campos `today`/`yesterday` representan "periodo actual"/"anterior" (se
  // conserva el nombre para no romper el contrato con el frontend).
  async salesToday(
    storeId?: string,
    compare: CompareMode = 'day',
    now: Date = this.now(),
  ): Promise<{
    today: { total: number; count: number };
    yesterday: { total: number; count: number };
    deltaPct: number | null;
    byStore: Array<{
      storeId: string;
      storeName: string;
      today: number;
      yesterday: number;
      deltaPct: number | null;
    }>;
    // Acumulado de facturación de hoy por hora con ventas (para la sparkline
    // intradía). Solo se calcula en `compare=day`; vacío en mes/año (la KPI card
    // que la consume siempre pide el día). Termina en today.total.
    intraday: number[];
  }> {
    const { organizationId } = requireTenant();
    const { currentStart, previousStart, previousSameElapsed } = comparisonStarts(compare, now);

    // Filtro común: desde el inicio del periodo anterior hasta AHORA, excluyendo
    // las ventas del anterior posteriores al mismo tiempo transcurrido (las del
    // periodo en curso entran por el primer OR).
    return withTenantTx(this.base, organizationId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          storeId: string;
          storeName: string;
          bucket: 'today' | 'yesterday';
          total: string;
          count: bigint;
        }>
      >`
        SELECT s.id::text AS "storeId",
               s.name AS "storeName",
               CASE WHEN sa."createdAt" >= ${currentStart} THEN 'today' ELSE 'yesterday' END AS bucket,
               COALESCE(SUM(sa.total), 0) AS total,
               COUNT(sa.id) AS count
        FROM "Store" s
        LEFT JOIN "Sale" sa
          ON sa."storeId" = s.id
         AND sa."organizationId" = ${organizationId}::uuid
         AND sa.status = 'COMPLETED'
         AND sa."createdAt" >= ${previousStart}
         AND sa."createdAt" < ${now}
         AND (sa."createdAt" >= ${currentStart} OR sa."createdAt" < ${previousSameElapsed})
        WHERE s."organizationId" = ${organizationId}::uuid
          AND s.active = true
          ${storeId ? this.eqStore('s.id', storeId) : EMPTY}
        GROUP BY s.id, s.name, bucket
      `;

      const byStoreMap = new Map<
        string,
        { storeId: string; storeName: string; today: number; yesterday: number }
      >();
      for (const r of rows) {
        const entry = byStoreMap.get(r.storeId) ?? {
          storeId: r.storeId,
          storeName: r.storeName,
          today: 0,
          yesterday: 0,
        };
        if (r.bucket === 'today') {
          entry.today += num(r.total);
        } else {
          entry.yesterday += num(r.total);
        }
        byStoreMap.set(r.storeId, entry);
      }

      const byStore = [...byStoreMap.values()].map((e) => ({
        ...e,
        deltaPct: deltaPct(e.today, e.yesterday),
      }));

      // Totales y conteos org: los contamos por separado (el LEFT JOIN duplicaría
      // si sumáramos counts del agregado por bucket, así que reusamos los buckets).
      const todayTotal = byStore.reduce((acc, s) => acc + s.today, 0);
      const yesterdayTotal = byStore.reduce((acc, s) => acc + s.yesterday, 0);
      const counts = await tx.$queryRaw<Array<{ bucket: 'today' | 'yesterday'; count: bigint }>>`
        SELECT CASE WHEN "createdAt" >= ${currentStart} THEN 'today' ELSE 'yesterday' END AS bucket,
               COUNT(*) AS count
        FROM "Sale"
        WHERE "organizationId" = ${organizationId}::uuid
          AND status = 'COMPLETED'
          AND "createdAt" >= ${previousStart}
          AND "createdAt" < ${now}
          AND ("createdAt" >= ${currentStart} OR "createdAt" < ${previousSameElapsed})
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
        GROUP BY bucket
      `;
      const todayCount = num(counts.find((c) => c.bucket === 'today')?.count);
      const yesterdayCount = num(counts.find((c) => c.bucket === 'yesterday')?.count);

      // Acumulado intradía de HOY por hora con ventas (sparkline STAT-01). Solo
      // tiene sentido en la comparativa por día; en mes/año se omite.
      const intraday: number[] = [];
      if (compare === 'day') {
        const hourly = await tx.$queryRaw<Array<{ hour: number; total: string }>>`
          SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COALESCE(SUM(total), 0) AS total
          FROM "Sale"
          WHERE "organizationId" = ${organizationId}::uuid
            AND status = 'COMPLETED'
            AND "createdAt" >= ${currentStart}
            AND "createdAt" < ${now}
            ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
          GROUP BY hour
          ORDER BY hour
        `;
        let acc = 0;
        for (const h of hourly) {
          acc += num(h.total);
          intraday.push(Math.round(acc * 100) / 100);
        }
      }

      return {
        today: { total: todayTotal, count: todayCount },
        yesterday: { total: yesterdayTotal, count: yesterdayCount },
        deltaPct: deltaPct(todayTotal, yesterdayTotal),
        byStore,
        intraday,
      };
    });
  }

  // Ventas netas agrupadas por familia de producto en el periodo. Líneas de
  // productos sin familia se agrupan bajo "Sin familia".
  async salesByFamily(
    q: DashboardPeriodQueryDto,
  ): Promise<
    Array<{ familyId: string | null; familyName: string; color: string | null; total: number }>
  > {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          familyId: string | null;
          familyName: string | null;
          color: string | null;
          total: string;
        }>
      >`
        SELECT pf.id::text AS "familyId",
               pf.name AS "familyName",
               pf.color AS color,
               COALESCE(SUM(sl."lineTotal"), 0) AS total
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        JOIN "Product" p ON p.id = sl."productId"
        LEFT JOIN "ProductFamily" pf ON pf.id = p."familyId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY pf.id, pf.name, pf.color
        ORDER BY total DESC
      `;
      return rows.map((r) => ({
        familyId: r.familyId,
        familyName: r.familyName ?? 'Sin familia',
        color: r.color,
        total: num(r.total),
      }));
    });
  }

  // Ventas por hora del día (STAT-02 / KPI-V10): nº de tickets e importe agrupados
  // por la hora de `createdAt`. Identifica las horas pico para dimensionar personal.
  // Solo devuelve las horas con ventas COMPLETED en el periodo.
  async salesByHour(
    q: DashboardPeriodQueryDto,
  ): Promise<Array<{ hour: number; count: number; revenue: number }>> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ hour: number; count: bigint; revenue: string }>>`
        SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour,
               COUNT(*) AS count,
               COALESCE(SUM(total), 0) AS revenue
        FROM "Sale"
        WHERE "organizationId" = ${organizationId}::uuid
          AND status = 'COMPLETED'
          AND "createdAt" >= ${range.from}
          AND "createdAt" < ${range.to}
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
        GROUP BY hour
        ORDER BY hour
      `;
      return rows.map((r) => ({ hour: r.hour, count: num(r.count), revenue: num(r.revenue) }));
    });
  }

  // Descuento medio por vendedor (STAT-04): tasa de descuento de ticket por usuario
  // sobre sus ventas COMPLETED del periodo. Misma fórmula que salesKpis.discountRate
  // (descuento / precio de tarifa), pero agrupada por vendedor. Útil para detectar
  // quién regala más margen. Ordena de mayor a menor descuento.
  async discountByEmployee(
    q: DashboardPeriodQueryDto,
  ): Promise<
    Array<{ userId: string; userName: string; salesCount: number; avgDiscountPct: number }>
  > {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      // Solo cuenta el descuento VOLUNTARIO (decisión comercial del vendedor); las
      // promociones preestablecidas son irrelevantes. discountTotal incluye todos los
      // descuentos (línea + ticket) y el origen solo se distingue por línea
      // (SaleLine.discountSource), así que: voluntario = discountTotal − Σ descuentos de
      // líneas PROMOTION (queda el voluntario de línea + el de ticket, que también aplica
      // el vendedor a mano). El subquery escalar por venta evita que el JOIN a líneas
      // duplique discountTotal/subtotal.
      const rows = await tx.$queryRaw<
        Array<{
          userId: string;
          userName: string;
          count: bigint;
          discount: string;
          promo: string;
          subtotal: string;
        }>
      >`
        SELECT u.id::text AS "userId",
               u.name AS "userName",
               COUNT(sa.id) AS count,
               COALESCE(SUM(sa."discountTotal"), 0) AS discount,
               COALESCE(SUM(
                 (SELECT COALESCE(SUM(sl."discountAmt"), 0) FROM "SaleLine" sl
                  WHERE sl."saleId" = sa.id AND sl."discountSource" = 'PROMOTION')
               ), 0) AS promo,
               COALESCE(SUM(sa.subtotal), 0) AS subtotal
        FROM "Sale" sa
        JOIN "User" u ON u.id = sa."userId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY u.id, u.name
      `;
      return rows
        .map((r) => {
          const totalDiscount = num(r.discount);
          const voluntary = totalDiscount - num(r.promo); // excluye promociones
          const subtotal = num(r.subtotal);
          const tarifa = subtotal + totalDiscount; // precio de tarifa (lista)
          return {
            userId: r.userId,
            userName: r.userName,
            salesCount: num(r.count),
            // Descuento VOLUNTARIO / precio de tarifa.
            avgDiscountPct: tarifa > 0 ? voluntary / tarifa : 0,
          };
        })
        .sort((a, b) => b.avgDiscountPct - a.avgDiscountPct);
    });
  }

  // Ventas por vendedor (D-08, preset Equipo): facturación y nº de tickets por
  // empleado en el periodo, de mayor a menor. Solo ventas COMPLETED (mismo
  // criterio que el resto de KPIs).
  async salesByEmployee(
    q: DashboardPeriodQueryDto,
  ): Promise<Array<{ userId: string; userName: string; salesCount: number; total: number }>> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ userId: string; userName: string; count: bigint; total: string }>
      >`
        SELECT u.id::text AS "userId",
               u.name AS "userName",
               COUNT(sa.id) AS count,
               COALESCE(SUM(sa.total), 0) AS total
        FROM "Sale" sa
        JOIN "User" u ON u.id = sa."userId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY u.id, u.name
        ORDER BY SUM(sa.total) DESC
      `;
      return rows.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        salesCount: num(r.count),
        total: num(r.total),
      }));
    });
  }

  // KPIs de venta: ticket medio, UPT, tasa de descuento, tasa de devolución.
  // `series` añade la evolución intra-periodo de cada KPI (por hora o por día,
  // según la duración) para las sparklines de las tarjetas.
  async salesKpis(q: DashboardPeriodQueryDto): Promise<{
    salesCount: number;
    revenue: number;
    avgTicket: number;
    upt: number;
    discountRate: number;
    returnRate: number;
    series: { avgTicket: number[]; upt: number[]; discountRate: number[]; returnRate: number[] };
  }> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const [agg] = await tx.$queryRaw<
        Array<{
          sales_count: bigint;
          revenue: string;
          subtotal: string;
          discount: string;
          units: string;
        }>
      >`
        SELECT COUNT(sa.id) AS sales_count,
               COALESCE(SUM(sa.total), 0) AS revenue,
               COALESCE(SUM(sa.subtotal), 0) AS subtotal,
               COALESCE(SUM(sa."discountTotal"), 0) AS discount,
               COALESCE((
                 SELECT SUM(sl.qty)
                 FROM "SaleLine" sl
                 JOIN "Sale" s2 ON s2.id = sl."saleId"
                 WHERE s2."organizationId" = ${organizationId}::uuid
                   AND s2.status = 'COMPLETED'
                   AND s2."createdAt" >= ${range.from}
                   AND s2."createdAt" < ${range.to}
                   ${storeId ? this.eqStore('s2."storeId"', storeId) : EMPTY}
               ), 0) AS units
        FROM "Sale" sa
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
      `;

      const [ret] = await tx.$queryRaw<Array<{ returns_total: string }>>`
        SELECT COALESCE(SUM(total), 0) AS returns_total
        FROM "Return"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "createdAt" >= ${range.from}
          AND "createdAt" < ${range.to}
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
      `;

      const salesCount = num(agg?.sales_count);
      const revenue = num(agg?.revenue);
      const subtotal = num(agg?.subtotal);
      const discount = num(agg?.discount);
      const units = num(agg?.units);
      const returnsTotal = num(ret?.returns_total);

      const series = await this.salesSeries(tx, organizationId, range, storeId);

      return {
        salesCount,
        revenue,
        avgTicket: salesCount > 0 ? revenue / salesCount : 0,
        upt: salesCount > 0 ? units / salesCount : 0,
        // subtotal aquí es el neto de líneas (post descuento de línea); discountTotal
        // incluye línea + ticket. La tasa relaciona descuento con la base bruta
        // (subtotal + discount ≈ importe a precio de tarifa).
        discountRate: subtotal + discount > 0 ? discount / (subtotal + discount) : 0,
        returnRate: revenue > 0 ? returnsTotal / revenue : 0,
        series,
      };
    });
  }

  // Granularidad de las series intra-periodo: por hora si el rango cubre ~1 día
  // (hoy/ayer), por día en rangos más largos (semana/mes/personalizado).
  private bucketUnit(range: DateRange): 'hour' | 'day' {
    const spanMs = range.to.getTime() - range.from.getTime();
    return spanMs <= 36 * 60 * 60 * 1000 ? 'hour' : 'day';
  }

  // Evolución intra-periodo de los KPIs de venta, un punto por bucket temporal
  // (hora o día). Cada serie va en orden cronológico para alimentar la sparkline.
  private async salesSeries(
    tx: TxClient,
    organizationId: string,
    range: DateRange,
    storeId?: string,
  ): Promise<{ avgTicket: number[]; upt: number[]; discountRate: number[]; returnRate: number[] }> {
    const unit = this.bucketUnit(range);
    const sales = await tx.$queryRaw<
      Array<{ bucket: Date; count: bigint; revenue: string; subtotal: string; discount: string }>
    >`
      SELECT date_trunc(${unit}, sa."createdAt") AS bucket,
             COUNT(*) AS count,
             COALESCE(SUM(sa.total), 0) AS revenue,
             COALESCE(SUM(sa.subtotal), 0) AS subtotal,
             COALESCE(SUM(sa."discountTotal"), 0) AS discount
      FROM "Sale" sa
      WHERE sa."organizationId" = ${organizationId}::uuid
        AND sa.status = 'COMPLETED'
        AND sa."createdAt" >= ${range.from}
        AND sa."createdAt" < ${range.to}
        ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
      GROUP BY bucket
      ORDER BY bucket
    `;
    const unitsRows = await tx.$queryRaw<Array<{ bucket: Date; units: string }>>`
      SELECT date_trunc(${unit}, sa."createdAt") AS bucket, COALESCE(SUM(sl.qty), 0) AS units
      FROM "SaleLine" sl
      JOIN "Sale" sa ON sa.id = sl."saleId"
      WHERE sa."organizationId" = ${organizationId}::uuid
        AND sa.status = 'COMPLETED'
        AND sa."createdAt" >= ${range.from}
        AND sa."createdAt" < ${range.to}
        ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
      GROUP BY bucket
    `;
    const returnsRows = await tx.$queryRaw<Array<{ bucket: Date; returns: string }>>`
      SELECT date_trunc(${unit}, "createdAt") AS bucket, COALESCE(SUM(total), 0) AS returns
      FROM "Return"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "createdAt" >= ${range.from}
        AND "createdAt" < ${range.to}
        ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
      GROUP BY bucket
    `;
    const unitsBy = new Map(unitsRows.map((r) => [new Date(r.bucket).getTime(), num(r.units)]));
    const returnsBy = new Map(
      returnsRows.map((r) => [new Date(r.bucket).getTime(), num(r.returns)]),
    );

    const avgTicket: number[] = [];
    const upt: number[] = [];
    const discountRate: number[] = [];
    const returnRate: number[] = [];
    for (const r of sales) {
      const key = new Date(r.bucket).getTime();
      const count = num(r.count);
      const revenue = num(r.revenue);
      const subtotal = num(r.subtotal);
      const discount = num(r.discount);
      const u = unitsBy.get(key) ?? 0;
      const ret = returnsBy.get(key) ?? 0;
      avgTicket.push(count > 0 ? Math.round((revenue / count) * 100) / 100 : 0);
      upt.push(count > 0 ? Math.round((u / count) * 100) / 100 : 0);
      discountRate.push(
        subtotal + discount > 0 ? Math.round((discount / (subtotal + discount)) * 1000) / 1000 : 0,
      );
      returnRate.push(revenue > 0 ? Math.round((ret / revenue) * 1000) / 1000 : 0);
    }
    return { avgTicket, upt, discountRate, returnRate };
  }

  // KPIs de margen: bruto (sin descuentos), real (tras descuentos) y % margen.
  // `series` (% margen) y `realMarginSeries` (€) añaden la evolución intra-periodo.
  async marginKpis(q: DashboardPeriodQueryDto): Promise<{
    grossMargin: number;
    realMargin: number;
    marginPct: number;
    revenue: number;
    series: number[];
    realMarginSeries: number[];
  }> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ gross: string; real: string; revenue: string }>>`
        SELECT
          COALESCE(SUM((sl."unitPrice" - sl."costPrice") * sl.qty), 0) AS gross,
          COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS real,
          COALESCE(SUM(sl."lineTotal"), 0) AS revenue
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
      `;
      const grossMargin = num(r?.gross);
      const realMargin = num(r?.real);
      const revenue = num(r?.revenue);
      const { series, realMarginSeries } = await this.marginSeries(
        tx,
        organizationId,
        range,
        storeId,
      );
      return {
        grossMargin,
        realMargin,
        marginPct: revenue > 0 ? realMargin / revenue : 0,
        revenue,
        series,
        realMarginSeries,
      };
    });
  }

  // Evolución intra-periodo del margen real (€) y del % de margen, por bucket
  // temporal (hora o día), en orden cronológico para las sparklines.
  private async marginSeries(
    tx: TxClient,
    organizationId: string,
    range: DateRange,
    storeId?: string,
  ): Promise<{ series: number[]; realMarginSeries: number[] }> {
    const unit = this.bucketUnit(range);
    const rows = await tx.$queryRaw<Array<{ bucket: Date; real: string; revenue: string }>>`
      SELECT date_trunc(${unit}, sa."createdAt") AS bucket,
             COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS real,
             COALESCE(SUM(sl."lineTotal"), 0) AS revenue
      FROM "SaleLine" sl
      JOIN "Sale" sa ON sa.id = sl."saleId"
      WHERE sa."organizationId" = ${organizationId}::uuid
        AND sa.status = 'COMPLETED'
        AND sa."createdAt" >= ${range.from}
        AND sa."createdAt" < ${range.to}
        ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
      GROUP BY bucket
      ORDER BY bucket
    `;
    const series: number[] = [];
    const realMarginSeries: number[] = [];
    for (const row of rows) {
      const real = num(row.real);
      const revenue = num(row.revenue);
      realMarginSeries.push(Math.round(real * 100) / 100);
      series.push(revenue > 0 ? Math.round((real / revenue) * 1000) / 1000 : 0);
    }
    return { series, realMarginSeries };
  }

  // KPIs de rotura de stock sobre StockAlert OUT_OF_STOCK en el periodo.
  async stockoutKpis(q: DashboardPeriodQueryDto): Promise<{
    events: number;
    resolved: number;
    open: number;
    avgDurationHours: number | null;
    rate: number;
    estimatedLostSales: number;
  }> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const [agg] = await tx.$queryRaw<
        Array<{ events: bigint; resolved: bigint; open: bigint; avg_seconds: string | null }>
      >`
        SELECT COUNT(*) AS events,
               COUNT(*) FILTER (WHERE resolved = true) AS resolved,
               COUNT(*) FILTER (WHERE resolved = false) AS open,
               AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) FILTER (WHERE resolved = true) AS avg_seconds
        FROM "StockAlert"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "alertType" = 'OUT_OF_STOCK'
          AND "createdAt" >= ${range.from}
          AND "createdAt" < ${range.to}
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
      `;

      const [prod] = await tx.$queryRaw<Array<{ active_products: bigint }>>`
        SELECT COUNT(*) AS active_products
        FROM "Product"
        WHERE "organizationId" = ${organizationId}::uuid AND active = true
      `;

      // Venta perdida estimada (proxy MVP): salePrice de cada producto agotado con
      // alerta abierta. Documentado como aproximación grosera (refinar en Semana 7).
      const [lost] = await tx.$queryRaw<Array<{ estimated: string }>>`
        SELECT COALESCE(SUM(p."salePrice"), 0) AS estimated
        FROM "StockAlert" al
        JOIN "Product" p ON p.id = al."productId"
        WHERE al."organizationId" = ${organizationId}::uuid
          AND al."alertType" = 'OUT_OF_STOCK'
          AND al.resolved = false
          AND al."createdAt" >= ${range.from}
          AND al."createdAt" < ${range.to}
          ${storeId ? this.eqStore('al."storeId"', storeId) : EMPTY}
      `;

      const events = num(agg?.events);
      const activeProducts = num(prod?.active_products);
      const avgSeconds = agg?.avg_seconds == null ? null : num(agg.avg_seconds);

      return {
        events,
        resolved: num(agg?.resolved),
        open: num(agg?.open),
        avgDurationHours: avgSeconds == null ? null : avgSeconds / 3600,
        rate: activeProducts > 0 ? events / activeProducts : 0,
        estimatedLostSales: num(lost?.estimated),
      };
    });
  }

  // Rankings de producto: top ventas (€), top margen real, peor rotación (uds).
  async productRankings(q: ProductRankingsQueryDto): Promise<{
    topSales: Array<{ productId: string; name: string; total: number; units: number }>;
    topMargin: Array<{ productId: string; name: string; margin: number }>;
    worstRotation: Array<{ productId: string; name: string; units: number }>;
  }> {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;
    const limit = q.limit ?? 10;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const topSales = await tx.$queryRaw<
        Array<{ productId: string; name: string; total: string; units: string }>
      >`
        SELECT p.id::text AS "productId", p.name AS name,
               COALESCE(SUM(sl."lineTotal"), 0) AS total,
               COALESCE(SUM(sl.qty), 0) AS units
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        JOIN "Product" p ON p.id = sl."productId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY p.id, p.name
        ORDER BY total DESC
        LIMIT ${limit}
      `;

      const topMargin = await tx.$queryRaw<
        Array<{ productId: string; name: string; margin: string }>
      >`
        SELECT p.id::text AS "productId", p.name AS name,
               COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0) AS margin
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        JOIN "Product" p ON p.id = sl."productId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY p.id, p.name
        ORDER BY margin DESC
        LIMIT ${limit}
      `;

      // Peor rotación: productos activos con menos unidades vendidas en el periodo
      // (incluye los de 0 ventas vía LEFT JOIN). Útil para detectar stock muerto.
      const worstRotation = await tx.$queryRaw<
        Array<{ productId: string; name: string; units: string }>
      >`
        SELECT p.id::text AS "productId", p.name AS name,
               COALESCE(SUM(sl.qty), 0) AS units
        FROM "Product" p
        LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
        LEFT JOIN "Sale" sa
          ON sa.id = sl."saleId"
         AND sa.status = 'COMPLETED'
         AND sa."createdAt" >= ${range.from}
         AND sa."createdAt" < ${range.to}
         ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        WHERE p."organizationId" = ${organizationId}::uuid
          AND p.active = true
        GROUP BY p.id, p.name
        ORDER BY units ASC, p.name ASC
        LIMIT ${limit}
      `;

      return {
        topSales: topSales.map((r) => ({
          productId: r.productId,
          name: r.name,
          total: num(r.total),
          units: num(r.units),
        })),
        topMargin: topMargin.map((r) => ({
          productId: r.productId,
          name: r.name,
          margin: num(r.margin),
        })),
        worstRotation: worstRotation.map((r) => ({
          productId: r.productId,
          name: r.name,
          units: num(r.units),
        })),
      };
    });
  }

  // Rotación + evolución de producto (STAT-05/06): por producto activo, unidades
  // vendidas en el periodo, días desde la última venta (de CUALQUIER fecha → detecta
  // stock muerto) y una tendencia de unidades por día (sparkline de evolución). Top
  // por unidades vendidas.
  async productRotation(q: DashboardPeriodQueryDto): Promise<
    Array<{
      productId: string;
      name: string;
      units: number;
      daysSinceLastSale: number | null;
      trend: number[];
      // IT-15: producto con poca historia → su dato propio es poco fiable.
      isNew: boolean;
      // Media diaria por producto de SU arquetipo (familia), sobre días abiertos: la
      // referencia robusta en la que se apoya un producto nuevo. null si no tiene familia.
      archetypeAvgDaily: number | null;
    }>
  > {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;
    const now = this.now();
    const LIMIT = 8;
    const NEW_PRODUCT_DAYS = 21;
    const dayMs = 24 * 60 * 60 * 1000;

    return withTenantTx(this.base, organizationId, async (tx) => {
      // Resumen: unidades del periodo (FILTER por rango/tienda) + última venta de
      // cualquier fecha (MAX sin filtrar → días sin venta global, para stock muerto) +
      // familia (arquetipo) y fecha de alta (para isNew).
      const summary = await tx.$queryRaw<
        Array<{
          productId: string;
          name: string;
          familyId: string | null;
          createdAt: Date;
          units: string;
          lastSale: Date | null;
        }>
      >`
        SELECT p.id::text AS "productId", p.name AS name,
               p."familyId"::text AS "familyId", p."createdAt" AS "createdAt",
               COALESCE(SUM(sl.qty) FILTER (
                 WHERE sa."createdAt" >= ${range.from} AND sa."createdAt" < ${range.to}
                 ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
               ), 0) AS units,
               MAX(sa."createdAt") AS "lastSale"
        FROM "Product" p
        LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
        LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'
        WHERE p."organizationId" = ${organizationId}::uuid AND p.active = true
        GROUP BY p.id, p.name, p."familyId", p."createdAt"
        ORDER BY units DESC, p.name ASC
        LIMIT ${LIMIT}
      `;

      // Agregado por arquetipo (familia) para la referencia de los productos nuevos:
      // unidades del periodo y nº de productos activos por familia. La media diaria por
      // producto del arquetipo = (unidades familia / díasDisponibles) / nº productos.
      const familyAgg = await tx.$queryRaw<
        Array<{ familyId: string | null; units: string; productCount: bigint }>
      >`
        SELECT p."familyId"::text AS "familyId",
               COALESCE(SUM(sl.qty) FILTER (
                 WHERE sa."createdAt" >= ${range.from} AND sa."createdAt" < ${range.to}
                 ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
               ), 0) AS units,
               COUNT(DISTINCT p.id) AS "productCount"
        FROM "Product" p
        LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
        LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'
        WHERE p."organizationId" = ${organizationId}::uuid AND p.active = true
        GROUP BY p."familyId"
      `;
      const familyById = new Map(
        familyAgg.map((f) => [f.familyId, { units: num(f.units), count: num(f.productCount) }]),
      );

      // Días con tienda abierta en el periodo (IT-14): denominador de la media.
      const sessionDays = await tx.$queryRaw<Array<{ day: Date }>>`
        SELECT DISTINCT DATE("openedAt") AS day
        FROM "CashSession"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "openedAt" >= ${range.from}
          AND "openedAt" < ${range.to}
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
      `;
      const periodDays = Math.max(
        1,
        Math.round((range.to.getTime() - range.from.getTime()) / dayMs),
      );
      const diasDisponibles = sessionDays.length > 0 ? sessionDays.length : periodDays;

      // Tendencia: unidades por día y producto en el periodo (evolución, STAT-06).
      // Ordenadas por día → al agrupar por producto queda la serie cronológica.
      const daily = await tx.$queryRaw<Array<{ productId: string; units: string }>>`
        SELECT sl."productId"::text AS "productId", COALESCE(SUM(sl.qty), 0) AS units
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY sl."productId", DATE(sa."createdAt")
        ORDER BY DATE(sa."createdAt")
      `;
      const trendByProduct = new Map<string, number[]>();
      for (const r of daily) {
        const arr = trendByProduct.get(r.productId) ?? [];
        arr.push(num(r.units));
        trendByProduct.set(r.productId, arr);
      }

      return summary.map((r) => {
        const fam = familyById.get(r.familyId);
        // Media diaria por producto del arquetipo (referencia robusta del nuevo).
        const archetypeAvgDaily =
          fam && fam.count > 0
            ? Math.round((fam.units / diasDisponibles / fam.count) * 1000) / 1000
            : null;
        const daysSinceCreated = Math.floor((now.getTime() - r.createdAt.getTime()) / dayMs);
        return {
          productId: r.productId,
          name: r.name,
          units: num(r.units),
          daysSinceLastSale: r.lastSale
            ? Math.floor((now.getTime() - new Date(r.lastSale).getTime()) / dayMs)
            : null,
          trend: trendByProduct.get(r.productId) ?? [],
          isNew: daysSinceCreated < NEW_PRODUCT_DAYS,
          archetypeAvgDaily,
        };
      });
    });
  }

  // Rotación AGREGADA POR ARQUETIPO (IT-13): el arquetipo es la familia del producto
  // (familyId). Agregar por arquetipo da más volumen → estadística más sólida y con
  // menos sesgo que por SKU concreto. Por arquetipo: nº de productos, unidades del
  // periodo, días desde la última venta del grupo y la tendencia sumada. Los productos
  // sin familia caen en un grupo "Sin arquetipo". Es la vista por DEFECTO; el detalle
  // por producto es el drill-down (productRotation).
  async archetypeRotation(q: DashboardPeriodQueryDto): Promise<
    Array<{
      familyId: string | null;
      familyName: string;
      productCount: number;
      units: number;
      ventaMediaDiaria: number;
      daysSinceLastSale: number | null;
      trend: number[];
    }>
  > {
    const { organizationId } = requireTenant();
    const range = this.rangeFor(q);
    const { storeId } = q;
    const now = this.now();
    const LIMIT = 8;
    const NONE = '∅'; // clave para el grupo sin familia (familyId NULL)
    const dayMsConst = 24 * 60 * 60 * 1000;

    return withTenantTx(this.base, organizationId, async (tx) => {
      const summary = await tx.$queryRaw<
        Array<{
          familyId: string | null;
          familyName: string | null;
          productCount: bigint;
          units: string;
          lastSale: Date | null;
        }>
      >`
        SELECT pf.id::text AS "familyId",
               pf.name AS "familyName",
               COUNT(DISTINCT p.id) AS "productCount",
               COALESCE(SUM(sl.qty) FILTER (
                 WHERE sa."createdAt" >= ${range.from} AND sa."createdAt" < ${range.to}
                 ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
               ), 0) AS units,
               MAX(sa."createdAt") AS "lastSale"
        FROM "Product" p
        LEFT JOIN "ProductFamily" pf ON pf.id = p."familyId"
        LEFT JOIN "SaleLine" sl ON sl."productId" = p.id
        LEFT JOIN "Sale" sa ON sa.id = sl."saleId" AND sa.status = 'COMPLETED'
        WHERE p."organizationId" = ${organizationId}::uuid AND p.active = true
        GROUP BY pf.id, pf.name
        ORDER BY units DESC, "familyName" ASC
        LIMIT ${LIMIT}
      `;

      // Tendencia por familia (suma de unidades por día del arquetipo).
      const daily = await tx.$queryRaw<Array<{ familyId: string | null; units: string }>>`
        SELECT p."familyId"::text AS "familyId", COALESCE(SUM(sl.qty), 0) AS units
        FROM "SaleLine" sl
        JOIN "Sale" sa ON sa.id = sl."saleId"
        JOIN "Product" p ON p.id = sl."productId"
        WHERE sa."organizationId" = ${organizationId}::uuid
          AND sa.status = 'COMPLETED'
          AND sa."createdAt" >= ${range.from}
          AND sa."createdAt" < ${range.to}
          ${storeId ? this.eqStore('sa."storeId"', storeId) : EMPTY}
        GROUP BY p."familyId", DATE(sa."createdAt")
        ORDER BY DATE(sa."createdAt")
      `;
      const trendByFamily = new Map<string, number[]>();
      for (const r of daily) {
        const key = r.familyId ?? NONE;
        const arr = trendByFamily.get(key) ?? [];
        arr.push(num(r.units));
        trendByFamily.set(key, arr);
      }

      // Contexto — días disponibles (IT-14): la venta media diaria se divide por los
      // días con la TIENDA ABIERTA (caja abierta) en el periodo, no por los naturales,
      // para que los días cerrados (festivos, descanso) no diluyan la media ni generen
      // falsas señales. Si no hay datos de caja, se usan los días naturales del periodo.
      // (El "días sin stock" por producto requiere histórico de niveles y queda fuera.)
      const sessionDays = await tx.$queryRaw<Array<{ day: Date }>>`
        SELECT DISTINCT DATE("openedAt") AS day
        FROM "CashSession"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "openedAt" >= ${range.from}
          AND "openedAt" < ${range.to}
          ${storeId ? this.eqStore('"storeId"', storeId) : EMPTY}
      `;
      const periodDays = Math.max(
        1,
        Math.round((range.to.getTime() - range.from.getTime()) / dayMsConst),
      );
      const diasDisponibles = sessionDays.length > 0 ? sessionDays.length : periodDays;

      return summary.map((r) => {
        const units = num(r.units);
        return {
          familyId: r.familyId,
          familyName: r.familyName ?? 'Sin arquetipo',
          productCount: num(r.productCount),
          units,
          ventaMediaDiaria: Math.round((units / diasDisponibles) * 1000) / 1000,
          daysSinceLastSale: r.lastSale
            ? Math.floor((now.getTime() - new Date(r.lastSale).getTime()) / dayMsConst)
            : null,
          trend: trendByFamily.get(r.familyId ?? NONE) ?? [],
        };
      });
    });
  }

  // Fragmento parametrizado `AND <col> = $storeId::uuid` para inyectar el filtro
  // opcional de tienda sin concatenar strings. `column` proviene SIEMPRE de
  // literales del propio código (nunca de input del usuario), por eso es seguro
  // usar Prisma.raw para el nombre de columna; el valor sí va parametrizado.
  private eqStore(column: string, storeId: string): Prisma.Sql {
    return Prisma.sql`AND ${Prisma.raw(column)} = ${storeId}::uuid`;
  }
}
