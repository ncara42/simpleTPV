import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateBrandingDto } from './branding.dto.js';

export interface Branding {
  brandColor: string | null;
  logoUrl: string | null;
}

// Patrones peligrosos en SVG: scripts, handlers de evento y javascript: URLs.
// El logo se pinta con <img src=dataURL> (no se inyecta inline), pero la defensa
// en profundidad evita persistir un vector de XSS por si eso cambiara.
const SVG_FORBIDDEN = /<script|javascript:|on[a-z]+\s*=|<foreignObject/i;

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  // RLS limita la consulta a la organización del actor: findFirst es seguro.
  async get(): Promise<Branding> {
    const org = await this.prisma.organization.findFirst({
      select: { brandColor: true, logoUrl: true },
    });
    return { brandColor: org?.brandColor ?? null, logoUrl: org?.logoUrl ?? null };
  }

  async update(dto: UpdateBrandingDto): Promise<Branding> {
    if (dto.logoUrl != null && dto.logoUrl.startsWith('data:image/svg+xml;base64,')) {
      const svg = Buffer.from(dto.logoUrl.split(',')[1] ?? '', 'base64').toString('utf8');
      if (SVG_FORBIDDEN.test(svg)) {
        throw new BadRequestException('El SVG del logo contiene elementos no permitidos.');
      }
    }
    // updateMany + RLS: solo puede tocar su propia organización, sin pasar id.
    await this.prisma.organization.updateMany({
      data: {
        ...(dto.brandColor !== undefined && { brandColor: dto.brandColor }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      },
    });
    return this.get();
  }
}
