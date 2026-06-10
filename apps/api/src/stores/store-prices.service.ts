import { Injectable } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { type ImportResult, parseCsv, rowNumber } from '../common/csv.js';
import { MAX_PRICE } from '../common/limits.js';
import { requireOwned } from '../common/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { SetStorePriceDto } from './store-prices.dto.js';

// El actor que gestiona los precios: lo necesita assertStoreAccess para acotar a un
// MANAGER a sus tiendas (un ADMIN/MANAGER es org-wide; SEC-01 cierra el IDOR entre
// tiendas para el resto de roles, que aquí no llegan por el @Roles del controller).
interface Actor {
  userId: string;
  role: string;
}

// Precios retail por tienda (#127 A): override del PVP del producto (Product.salePrice)
// por (producto, tienda). RLS por tenant; además organizationId explícito en todos los
// where (defensa en profundidad) y verificación de pertenencia de tienda y producto al
// tenant antes de escribir. El precio se resuelve en la venta (SalesService.create); sin
// override un producto usa su PVP en esa tienda (comportamiento por defecto).
@Injectable()
export class StorePricesService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista los overrides de una tienda, enriquecidos con nombre y PVP del producto
  // para la tabla del backoffice. Una tienda de otra org no devuelve filas (RLS +
  // filtro por organizationId), así que la lista sale vacía sin filtrar entre tenants.
  async list(storeId: string, actor: Actor) {
    const { organizationId } = requireTenant();
    await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    const rows = await this.prisma.storePrice.findMany({
      where: { storeId, organizationId },
      orderBy: { product: { name: 'asc' } },
      include: { product: { select: { name: true, salePrice: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      price: r.price,
      product: { name: r.product.name, salePrice: r.product.salePrice },
    }));
  }

  // Upsert de un override (producto, tienda). Verifica que tanto la tienda como el
  // producto son del tenant antes de escribir: así un ADMIN org-wide no puede crear
  // un override de su org apuntando a una tienda de OTRA org (el FK de Store no es
  // tenant-scoped a nivel BD). El precio es ABSOLUTO.
  async setPrice(storeId: string, dto: SetStorePriceDto, actor: Actor) {
    const { organizationId } = requireTenant();
    await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    await requireOwned(
      this.prisma.store.findFirst({ where: { id: storeId, organizationId }, select: { id: true } }),
      'Tienda no encontrada.',
    );
    await requireOwned(
      this.prisma.product.findFirst({
        where: { id: dto.productId, organizationId },
        select: { id: true },
      }),
      'Producto no encontrado.',
    );
    return this.prisma.storePrice.upsert({
      where: { productId_storeId: { productId: dto.productId, storeId } },
      create: { organizationId, storeId, productId: dto.productId, price: dto.price },
      update: { price: dto.price },
    });
  }

  // Importa overrides de precio de una tienda desde CSV (columnas: sku,price).
  // Resuelve el producto por SKU dentro del tenant; reporta errores por fila sin
  // abortar el lote. Verifica acceso a la tienda igual que setPrice.
  async importCsv(storeId: string, csv: string, actor: Actor): Promise<ImportResult> {
    const { organizationId } = requireTenant();
    await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    await requireOwned(
      this.prisma.store.findFirst({ where: { id: storeId, organizationId }, select: { id: true } }),
      'Tienda no encontrada.',
    );
    const rows = parseCsv(csv);
    const errors: ImportResult['errors'] = [];
    let inserted = 0;

    for (const [idx, cells] of rows.entries()) {
      const row = rowNumber(idx);
      const sku = (cells.sku ?? '').trim();
      const priceRaw = (cells.price ?? '').trim();
      const price = Number(priceRaw);
      if (!sku) {
        errors.push({ row, message: 'Falta el SKU' });
        continue;
      }
      if (!priceRaw || Number.isNaN(price) || price < 0 || price > MAX_PRICE) {
        errors.push({ row, message: 'Precio inválido' });
        continue;
      }
      const product = await this.prisma.product.findFirst({
        where: { sku, organizationId },
        select: { id: true },
      });
      if (!product) {
        errors.push({ row, message: `Sin producto con SKU "${sku}"` });
        continue;
      }
      await this.prisma.storePrice.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        create: { organizationId, storeId, productId: product.id, price },
        update: { price },
      });
      inserted += 1;
    }
    return { inserted, errors };
  }

  // Quita el override → el producto vuelve a usar su PVP en esa tienda. deleteMany
  // filtra por organizationId, así que una tienda/producto de otra org no borra nada.
  async removePrice(storeId: string, productId: string, actor: Actor): Promise<void> {
    const { organizationId } = requireTenant();
    await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    await this.prisma.storePrice.deleteMany({ where: { storeId, productId, organizationId } });
  }
}
