import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, type RedisOptions, Worker } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { PRISMA_BASE } from '../prisma/prisma.tokens.js';
import { requireTenant, tenantStorage } from '../prisma/tenant-context.js';
import { withTenantTx } from '../prisma/with-tenant-tx.js';
import { buildQrData, computeHash, type VerifactuPayload } from './verifactu.hash.js';
import { VERIFACTU_PROVIDER, type VerifactuProvider } from './verifactu.provider.js';

const QUEUE_NAME = 'verifactu';
const MAX_ATTEMPTS = 5;

interface JobData {
  recordId: string;
  organizationId: string;
}

@Injectable()
export class VerifactuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerifactuService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRISMA_BASE) private readonly base: PrismaService,
    @Inject(VERIFACTU_PROVIDER) private readonly provider: VerifactuProvider,
  ) {}

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      // Sin Redis (dev/test): no hay cola; el envío se procesa en el momento
      // (processRecord) al crear el registro. Funciona en una instancia.
      return;
    }
    // Conexión por opciones (host/port/password) derivadas de REDIS_URL. BullMQ
    // crea su propia conexión con maxRetriesPerRequest=null internamente.
    const parsed = new URL(url);
    const connection: RedisOptions = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.password ? { password: parsed.password } : {}),
    };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const data = job.data as JobData;
        await this.processRecord(data.recordId, data.organizationId);
      },
      { connection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job VeriFactu ${job?.id} falló: ${String(err)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Crea el registro VeriFactu de una venta/devolución (#47), encadenado con el
   * anterior del tenant, y lo encola para envío. Debe llamarse dentro del flujo
   * de la venta/devolución, idealmente tras commit. Devuelve el registro creado.
   *
   * El encadenamiento (lectura del último hash + creación) va en una tx con lock
   * para serializar: dos registros concurrentes del mismo tenant no deben tomar
   * el mismo previousHash.
   */
  async recordFor(input: {
    type: 'INVOICE' | 'RECTIFICATION';
    saleId?: string;
    returnId?: string;
    payload: VerifactuPayload;
  }): Promise<{ id: string; hash: string; qrData: string }> {
    const tenant = requireTenant();
    const created = await withTenantTx(this.base, tenant.organizationId, async (tx) => {
      // Lock de los registros del tenant para serializar el encadenamiento.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenant.organizationId}))`;
      const last = await tx.verifactuRecord.findFirst({
        where: { organizationId: tenant.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { hash: true },
      });
      const previousHash = last?.hash ?? null;
      const hash = computeHash(input.payload, previousHash);
      const qrData = buildQrData(
        input.payload.nif,
        input.payload.invoiceNumber,
        input.payload.total,
      );
      return tx.verifactuRecord.create({
        data: {
          organizationId: tenant.organizationId,
          type: input.type,
          ...(input.saleId ? { saleId: input.saleId } : {}),
          ...(input.returnId ? { returnId: input.returnId } : {}),
          hash,
          previousHash,
          qrData,
          payload: input.payload as unknown as object,
        },
      });
    });

    // Encolar el envío. Sin cola (sin Redis), procesar en el momento.
    if (this.queue) {
      await this.queue.add(
        'send',
        { recordId: created.id, organizationId: tenant.organizationId },
        { attempts: MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 2000 } },
      );
    } else {
      await this.processRecord(created.id, tenant.organizationId);
    }

    return { id: created.id, hash: created.hash, qrData: created.qrData! };
  }

  /**
   * Procesa el envío de un registro: llama al proveedor y actualiza el estado
   * (SENT/FAILED) + attempts/lastError. Lo invoca el worker (o directamente sin
   * cola). Si el proveedor falla, lanza para que BullMQ reintente.
   */
  async processRecord(recordId: string, organizationId: string): Promise<void> {
    // El worker corre fuera de un contexto de tenant; lo fijamos en el
    // AsyncLocalStorage para que el cliente extendido aplique RLS por-operación.
    const shouldThrow = await tenantStorage.run({ organizationId }, async () => {
      const record = await this.prisma.verifactuRecord.findFirst({
        where: { id: recordId, organizationId },
      });
      if (!record || record.status === 'SENT') {
        return false;
      }
      const result = await this.provider.send(
        record.payload as unknown as VerifactuPayload,
        record.hash,
      );
      if (result.ok) {
        await this.prisma.verifactuRecord.updateMany({
          where: { id: recordId, organizationId },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
        return false;
      }
      // Fallo: incrementa intentos; si agota, marca FAILED.
      const attempts = record.attempts + 1;
      await this.prisma.verifactuRecord.updateMany({
        where: { id: recordId, organizationId },
        data: {
          attempts,
          lastError: result.error ?? 'envío rechazado',
          ...(attempts >= MAX_ATTEMPTS ? { status: 'FAILED' as const } : {}),
        },
      });
      // Devuelve true si aún quedan intentos → el llamante lanza para reintentar.
      return attempts < MAX_ATTEMPTS;
    });
    if (shouldThrow) {
      throw new Error('envío VeriFactu rechazado');
    }
  }

  /** Lista de registros del tenant, filtrable por estado. */
  async list(status?: string) {
    const tenant = requireTenant();
    return this.prisma.verifactuRecord.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(status ? { status: status as 'PENDING' | 'SENT' | 'FAILED' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Reintenta un registro FAILED: lo re-encola (o procesa) y resetea a PENDING. */
  async retry(id: string): Promise<void> {
    const tenant = requireTenant();
    const record = await this.prisma.verifactuRecord.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!record) {
      return;
    }
    await this.prisma.verifactuRecord.update({
      where: { id },
      data: { status: 'PENDING', lastError: null },
    });
    if (this.queue) {
      await this.queue.add(
        'send',
        { recordId: id, organizationId: tenant.organizationId },
        { attempts: MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 2000 } },
      );
    } else {
      await this.processRecord(id, tenant.organizationId);
    }
  }
}
