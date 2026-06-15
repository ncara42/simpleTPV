import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { type SaleStatus } from '@simpletpv/db';
import { Queue, Worker } from 'bullmq';

import { JOB_RETENTION, redisOptionsFromUrl } from '../common/redis-options.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant, tenantStorage } from '../prisma/tenant-context.js';
import type { SaleRole } from './sales.domain.js';
import { SalesService } from './sales.service.js';

const QUEUE_NAME = 'sales-export';

// Formato del export: 'sales' (historial de ventas, IT-05) o 'accounting' (libro
// de IVA repercutido para gestoría, #125). Se persiste DENTRO de filters (Json)
// para no requerir migración: parametriza el job junto con los filtros.
export type ExportFormat = 'sales' | 'accounting';

// Filtros del export (los mismos del listado, sin paginación). Se guardan en
// SalesExport.filters y viajan en el job para regenerar el CSV en el worker.
// `format` viaja aquí también (ver ExportFormat).
interface ExportFilters {
  storeId?: string;
  date?: string;
  from?: string;
  to?: string;
  q?: string;
  userId?: string;
  familyId?: string;
  status?: SaleStatus;
  format?: ExportFormat;
}

interface JobData {
  exportId: string;
  organizationId: string;
  requesterId: string;
  role: SaleRole;
  filters: ExportFilters;
}

// Export asíncrono del historial de ventas a CSV (IT-05). El endpoint crea un
// SalesExport (PENDING) y encola un job; el worker genera el CSV en background y
// guarda el resultado → la UI no se bloquea, solo consulta el estado y descarga.
// Sin Redis (dev/test) degrada a procesado en el momento, como VerifactuService.
@Injectable()
export class SalesExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesExportService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    // Feature flags (#127 B): gatea la exportación (ventas y contable) a nivel org.
    // @Optional para no romper construcciones directas en tests; DI lo provee en prod.
    @Optional() private readonly features?: FeatureFlagService,
  ) {}

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      // Sin Redis (dev/test): sin cola; el export se genera en el momento.
      return;
    }
    const connection = redisOptionsFromUrl(url);
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const d = job.data as JobData;
        await this.process(d);
      },
      { connection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job export ${job?.id} falló: ${String(err)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Pide un export: crea el registro (PENDING), encola el job y devuelve su id y
   * estado actual. Con Redis devuelve PENDING (lo procesa el worker); sin Redis lo
   * procesa en el momento y devuelve ya COMPLETED/FAILED.
   */
  async requestExport(
    filters: ExportFilters,
    requesterId: string,
    role: SaleRole,
    format: ExportFormat = 'sales',
  ): Promise<{ id: string; status: string }> {
    const tenant = requireTenant();
    // Feature flag (#127 B): la exportación (ventas y contable) es de central; se
    // gatea a nivel org → 403 si está apagada. Sin flag → comportamiento actual.
    await this.features?.assertEnabled('data_export');
    // Guarda SOLO los campos de filtro (no page/pageSize) + el formato, para
    // trazabilidad y para que el worker regenere exactamente el mismo conjunto.
    const stored: ExportFilters = {
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.date ? { date: filters.date } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.familyId ? { familyId: filters.familyId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      format,
    };
    const created = await this.prisma.salesExport.create({
      data: {
        organizationId: tenant.organizationId,
        requestedById: requesterId,
        filters: stored as object,
      },
      select: { id: true },
    });

    const job: JobData = {
      exportId: created.id,
      organizationId: tenant.organizationId,
      requesterId,
      role,
      filters: stored,
    };
    if (this.queue) {
      await this.queue.add('export', job, { attempts: 1, ...JOB_RETENTION });
      return { id: created.id, status: 'PENDING' };
    }
    await this.process(job);
    const done = await this.prisma.salesExport.findFirst({
      where: { id: created.id, organizationId: tenant.organizationId },
      select: { status: true },
    });
    return { id: created.id, status: done?.status ?? 'PENDING' };
  }

  /**
   * Genera el CSV del export y persiste el resultado. Lo invoca el worker (o
   * requestExport sin Redis). Marca PROCESSING → COMPLETED (csv+rowCount) o FAILED
   * (error). Fija el tenant en el AsyncLocalStorage porque el worker corre fuera de
   * un contexto de request (necesario para RLS y para SalesService.requireTenant).
   */
  private async process(job: JobData): Promise<void> {
    await tenantStorage.run({ organizationId: job.organizationId }, async () => {
      await this.prisma.salesExport.updateMany({
        where: { id: job.exportId, organizationId: job.organizationId },
        data: { status: 'PROCESSING' },
      });
      try {
        // Despacha según el formato: 'accounting' → libro de IVA (#125); por
        // defecto el historial de ventas (IT-05). Separa `format` de los filtros
        // de BD para no pasarlo a buildSalesFilter (solo lee claves de filtro).
        const { format, ...filterQuery } = job.filters;
        const { csv, rowCount } =
          format === 'accounting'
            ? await this.sales.generateAccountingCsv(filterQuery, job.requesterId, job.role)
            : await this.sales.generateExportCsv(filterQuery, job.requesterId, job.role);
        await this.prisma.salesExport.updateMany({
          where: { id: job.exportId, organizationId: job.organizationId },
          data: { status: 'COMPLETED', csv, rowCount, completedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Export ${job.exportId} falló: ${String(err)}`);
        await this.prisma.salesExport.updateMany({
          where: { id: job.exportId, organizationId: job.organizationId },
          data: {
            status: 'FAILED',
            error: err instanceof Error ? err.message : String(err),
            completedAt: new Date(),
          },
        });
      }
    });
  }

  /** Estado/metadatos del export (sin el CSV, que puede ser grande). */
  async getExport(id: string): Promise<{
    id: string;
    status: string;
    rowCount: number | null;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }> {
    const tenant = requireTenant();
    const row = await this.prisma.salesExport.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: {
        id: true,
        status: true,
        rowCount: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Export no encontrado');
    }
    return row;
  }

  /**
   * Devuelve el CSV de un export COMPLETED + el nombre de fichero sugerido según
   * el formato (libro-iva.csv para 'accounting', ventas.csv para el resto). 409 si
   * aún no está listo.
   */
  async downloadCsv(id: string): Promise<{ csv: string; filename: string }> {
    const tenant = requireTenant();
    const row = await this.prisma.salesExport.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { status: true, csv: true, filters: true },
    });
    if (!row) {
      throw new NotFoundException('Export no encontrado');
    }
    if (row.status !== 'COMPLETED' || row.csv == null) {
      throw new ConflictException(`El export no está listo (estado ${row.status})`);
    }
    // filters es Json (cualquier estructura): guarda defensiva antes de leer format.
    const stored =
      row.filters !== null && typeof row.filters === 'object' && !Array.isArray(row.filters)
        ? (row.filters as Record<string, unknown>)
        : {};
    const filename = stored.format === 'accounting' ? 'libro-iva.csv' : 'ventas.csv';
    return { csv: row.csv, filename };
  }
}
