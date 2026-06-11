import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Product } from '@simpletpv/db';

import { type ImportResult, parseCsv, rowNumber } from '../common/csv.js';
import { MAX_PRICE } from '../common/limits.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateProductDto, UpdateProductDto } from './products.dto.js';

export type { ImportResult };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductDto): Promise<Product> {
    // RLS filtra lectura/escritura por la policy, pero el INSERT necesita el
    // organizationId explícito (lo toma del contexto de tenant del JWT).
    const tenant = requireTenant();
    return this.prisma.product.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  async findAll(search?: string, familyId?: string): Promise<Product[]> {
    const where: Prisma.ProductWhereInput = {};
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (familyId) {
      where.familyId = familyId;
    }
    const hasFilter = Object.keys(where).length > 0;
    return this.prisma.product.findMany({
      ...(hasFilter ? { where } : {}),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto ${id} no encontrado`);
    }
    return product;
  }

  async update(id: string, input: UpdateProductDto): Promise<Product> {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
  }

  async findByBarcode(code: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { barcode: code } });
    if (!product) {
      throw new NotFoundException(`Producto con código ${code} no encontrado`);
    }
    return product;
  }

  // Importación masiva desde CSV. Parsea, valida fila a fila, inserta las
  // válidas en bulk y devuelve un reporte de errores (no aborta por una mala).
  async importCsv(csv: string): Promise<ImportResult> {
    const tenant = requireTenant();

    const rows = parseCsv(csv);
    const valid: Prisma.ProductCreateManyInput[] = [];
    const errors: ImportResult['errors'] = [];

    rows.forEach((cells, idx) => {
      const row = rowNumber(idx);
      const name = (cells.name ?? '').trim();
      const priceRaw = (cells.salePrice ?? '').trim();
      const price = Number(priceRaw);
      if (!name) {
        errors.push({ row, message: 'Falta el nombre' });
        return;
      }
      if (!priceRaw || Number.isNaN(price)) {
        errors.push({ row, message: 'Precio inválido' });
        return;
      }
      // Mismas cotas que CreateProductDto (SEC-16): el import a mano no debe ser una
      // puerta trasera a precios negativos (que generan ventas/cuadres negativos) ni
      // a valores que excedan Decimal(10,4).
      if (price < 0 || price > MAX_PRICE) {
        errors.push({ row, message: 'Precio fuera de rango (0–999999.9999)' });
        return;
      }
      valid.push({
        organizationId: tenant.organizationId,
        name,
        salePrice: price,
        sku: cells.sku?.trim() || null,
        barcode: cells.barcode?.trim() || null,
      });
    });

    let inserted = 0;
    if (valid.length > 0) {
      const res = await this.prisma.product.createMany({ data: valid });
      inserted = res.count;
    }
    return { inserted, errors };
  }
}
