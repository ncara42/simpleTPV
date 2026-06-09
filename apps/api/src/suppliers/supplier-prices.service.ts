import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { type ImportResult, parseCsv, rowNumber } from '../common/csv.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type {
  ImportSupplierPricesDto,
  ListSupplierPricesQueryDto,
  UpsertSupplierPriceDto,
} from './supplier-prices.dto.js';

const MAX_PRICE = 999999.9999;

// Tarifa de compra con los nombres de proveedor y producto resueltos (para la UI).
export interface SupplierPriceRow {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string | null;
  price: number;
}

// Fila de la comparativa: un producto y su precio en cada proveedor, con el mejor.
export interface ComparisonRow {
  productId: string;
  productName: string;
  sku: string | null;
  prices: Array<{ supplierId: string; supplierName: string; price: number }>;
  best: { supplierId: string; supplierName: string; price: number } | null;
}

@Injectable()
export class SupplierPricesService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista de tarifas (opcionalmente filtrada por proveedor y/o producto).
  async list(query: ListSupplierPricesQueryDto): Promise<SupplierPriceRow[]> {
    const { organizationId } = requireTenant();
    const rows = await this.prisma.supplierPrice.findMany({
      where: {
        organizationId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        product: { select: { name: true, sku: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { price: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      productId: r.productId,
      productName: r.product.name,
      sku: r.product.sku,
      price: Number(r.price),
    }));
  }

  // Crea o actualiza la tarifa de un (proveedor, producto). Valida pertenencia al
  // tenant (RLS + comprobación explícita) antes de escribir.
  async upsert(input: UpsertSupplierPriceDto): Promise<SupplierPriceRow> {
    const { organizationId } = requireTenant();
    await this.requireSupplier(input.supplierId);
    await this.requireProduct(input.productId);
    const saved = await this.prisma.supplierPrice.upsert({
      where: { supplierId_productId: { supplierId: input.supplierId, productId: input.productId } },
      create: {
        organizationId,
        supplierId: input.supplierId,
        productId: input.productId,
        price: input.price,
      },
      update: { price: input.price },
      include: {
        supplier: { select: { name: true } },
        product: { select: { name: true, sku: true } },
      },
    });
    return {
      id: saved.id,
      supplierId: saved.supplierId,
      supplierName: saved.supplier.name,
      productId: saved.productId,
      productName: saved.product.name,
      sku: saved.product.sku,
      price: Number(saved.price),
    };
  }

  async remove(id: string): Promise<void> {
    const found = await this.prisma.supplierPrice.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Tarifa ${id} no encontrada`);
    }
    await this.prisma.supplierPrice.delete({ where: { id } });
  }

  // Comparativa entre proveedores: por cada producto (del arquetipo dado, si se
  // indica) sus tarifas en todos los proveedores y la más barata.
  async comparison(familyId?: string): Promise<ComparisonRow[]> {
    const { organizationId } = requireTenant();
    const rows = await this.prisma.supplierPrice.findMany({
      where: {
        organizationId,
        ...(familyId ? { product: { familyId } } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        product: { select: { name: true, sku: true } },
      },
      orderBy: { price: 'asc' },
    });

    const byProduct = new Map<string, ComparisonRow>();
    for (const r of rows) {
      const entry = byProduct.get(r.productId) ?? {
        productId: r.productId,
        productName: r.product.name,
        sku: r.product.sku,
        prices: [],
        best: null,
      };
      const price = {
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        price: Number(r.price),
      };
      entry.prices.push(price);
      // Las filas vienen ordenadas por precio asc → el primero de cada producto es el mejor.
      if (entry.best === null || price.price < entry.best.price) {
        entry.best = price;
      }
      byProduct.set(r.productId, entry);
    }
    return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }

  // Importa tarifas de un proveedor desde CSV (columnas: sku,price). Resuelve el
  // producto por SKU dentro del tenant; reporta errores por fila sin abortar el lote.
  async importCsv(input: ImportSupplierPricesDto): Promise<ImportResult> {
    const { organizationId } = requireTenant();
    await this.requireSupplier(input.supplierId);
    const rows = parseCsv(input.csv);
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
      const product = await this.prisma.product.findFirst({ where: { sku }, select: { id: true } });
      if (!product) {
        errors.push({ row, message: `Sin producto con SKU "${sku}"` });
        continue;
      }
      await this.prisma.supplierPrice.upsert({
        where: { supplierId_productId: { supplierId: input.supplierId, productId: product.id } },
        create: {
          organizationId,
          supplierId: input.supplierId,
          productId: product.id,
          price,
        },
        update: { price },
      });
      inserted += 1;
    }
    return { inserted, errors };
  }

  private async requireSupplier(id: string): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({ where: { id }, select: { id: true } });
    if (!supplier) {
      throw new BadRequestException(`Proveedor ${id} no encontrado`);
    }
  }

  private async requireProduct(id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id }, select: { id: true } });
    if (!product) {
      throw new BadRequestException(`Producto ${id} no encontrado`);
    }
  }
}
