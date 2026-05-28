import { Injectable } from '@nestjs/common';
import type { MovementType } from '@simpletpv/db';

import type { PrismaService } from '../prisma/prisma.service.js';

// Cliente transaccional de Prisma (lo que recibe el callback de $transaction),
// idéntico al tipo usado en with-tenant-tx. applyMovement opera SIEMPRE sobre un
// tx ya abierto por withTenantTx (con el tenant fijado), nunca abre el suyo.
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface ApplyMovementInput {
  organizationId: string;
  productId: string;
  storeId: string;
  type: MovementType;
  // Positivo = entrada (reposición), negativo = salida (venta). El stock puede
  // quedar negativo: la venta nunca se bloquea por falta de stock (decisión de
  // semana 3); el control de mínimos es vía alertas, no bloqueo.
  quantity: number;
  referenceId?: string;
  reason?: string;
  userId?: string;
}

@Injectable()
export class StockService {
  /**
   * Aplica un movimiento de stock de forma atómica dentro de la transacción `tx`
   * recibida: upsert del Stock (incrementa/decrementa quantity) + registro del
   * StockMovement. DEBE llamarse dentro de un withTenantTx (tenant fijado), para
   * que ambas escrituras compartan la misma transacción y RLS quede aplicada.
   *
   * Devuelve la cantidad resultante en Stock tras el movimiento (útil para emitir
   * eventos / reevaluar alertas en issues posteriores).
   */
  async applyMovement(tx: TxClient, input: ApplyMovementInput): Promise<number> {
    const { organizationId, productId, storeId, type, quantity, referenceId, reason, userId } =
      input;

    const stock = await tx.stock.upsert({
      where: { productId_storeId: { productId, storeId } },
      update: { quantity: { increment: quantity } },
      create: { organizationId, productId, storeId, quantity },
    });

    await tx.stockMovement.create({
      data: {
        organizationId,
        productId,
        storeId,
        type,
        quantity,
        ...(referenceId !== undefined ? { referenceId } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(userId !== undefined ? { userId } : {}),
      },
    });

    return Number(stock.quantity);
  }
}
