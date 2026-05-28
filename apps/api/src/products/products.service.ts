import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';

export interface CreateProductInput {
  name: string;
  salePrice: number;
  description?: string | null;
  barcode?: string | null;
  sku?: string | null;
  costPrice?: number;
  taxRate?: number;
  saleUnit?: 'UNIT' | 'WEIGHT' | 'VOLUME' | 'LENGTH';
  unitSymbol?: string;
  familyId?: string | null;
  active?: boolean;
}

export type UpdateProductInput = Partial<CreateProductInput>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductInput): Promise<unknown> {
    // RLS filtra lectura/escritura por la policy, pero el INSERT necesita el
    // organizationId explícito (lo toma del contexto de tenant del JWT).
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }
    return this.prisma.product.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  async findAll(search?: string, familyId?: string): Promise<unknown[]> {
    const where: Record<string, unknown> = {};
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { sku: { contains: search, mode: 'insensitive' as const } },
        { barcode: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (familyId) {
      where.familyId = familyId;
    }
    return this.prisma.product.findMany({
      ...(Object.keys(where).length ? { where } : {}),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<unknown> {
    const product = await this.prisma.product.findFirst({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto ${id} no encontrado`);
    }
    return product;
  }

  async update(id: string, input: UpdateProductInput): Promise<unknown> {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
  }

  async findByBarcode(code: string): Promise<unknown> {
    const product = await this.prisma.product.findFirst({ where: { barcode: code } });
    if (!product) {
      throw new NotFoundException(`Producto con código ${code} no encontrado`);
    }
    return product;
  }

  // Importación masiva desde CSV. Parsea, valida fila a fila, inserta las
  // válidas en bulk y devuelve un reporte de errores (no aborta por una mala).
  async importCsv(csv: string): Promise<{
    inserted: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }

    const rows = parseCsv(csv);
    const valid: Array<{
      organizationId: string;
      name: string;
      salePrice: number;
      sku: string | null;
      barcode: string | null;
    }> = [];
    const errors: Array<{ row: number; message: string }> = [];

    rows.forEach((cells, idx) => {
      const rowNumber = idx + 2; // +1 por cabecera, +1 porque humano cuenta desde 1
      const name = (cells.name ?? '').trim();
      const priceRaw = (cells.salePrice ?? '').trim();
      const price = Number(priceRaw);
      if (!name) {
        errors.push({ row: rowNumber, message: 'Falta el nombre' });
        return;
      }
      if (!priceRaw || Number.isNaN(price)) {
        errors.push({ row: rowNumber, message: 'Precio inválido' });
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
      const res = (await this.prisma.product.createMany({ data: valid })) as { count: number };
      inserted = res.count;
    }
    return { inserted, errors };
  }
}

// Parser CSV mínimo: primera línea = cabecera, resto = filas. Separador coma,
// sin soporte de comillas/escapes (el catálogo importado es de formato simple).
function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return [];
  }
  const header = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}
