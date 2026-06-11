import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BrandingService } from './branding.service.js';

// PrismaService mockeado: el aislamiento por organización lo da RLS en
// integración; aquí se verifica el cableado y la sanitización del SVG.
const prisma = {
  organization: {
    findFirst: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
};

const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

describe('BrandingService', () => {
  let service: BrandingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BrandingService(prisma as never);
  });

  it('get devuelve la marca de la organización (o nulls sin configurar)', async () => {
    prisma.organization.findFirst.mockResolvedValueOnce({ brandColor: '#aa00ff', logoUrl: null });
    expect(await service.get()).toEqual({ brandColor: '#aa00ff', logoUrl: null });

    prisma.organization.findFirst.mockResolvedValueOnce(null);
    expect(await service.get()).toEqual({ brandColor: null, logoUrl: null });
  });

  it('update persiste solo los campos aportados y devuelve el estado', async () => {
    prisma.organization.findFirst.mockResolvedValueOnce({ brandColor: '#112233', logoUrl: null });
    const res = await service.update({ brandColor: '#112233' });
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      data: { brandColor: '#112233' },
    });
    expect(res.brandColor).toBe('#112233');
  });

  it('update con null restaura el valor por defecto', async () => {
    prisma.organization.findFirst.mockResolvedValueOnce({ brandColor: null, logoUrl: null });
    await service.update({ brandColor: null, logoUrl: null });
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      data: { brandColor: null, logoUrl: null },
    });
  });

  it('acepta un SVG limpio y rechaza scripts/handlers (defensa XSS)', async () => {
    prisma.organization.findFirst.mockResolvedValue({ brandColor: null, logoUrl: 'x' });
    await expect(
      service.update({ logoUrl: svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"/>') }),
    ).resolves.toBeDefined();

    for (const evil of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"/>',
      '<svg><a href="javascript:alert(1)">x</a></svg>',
      '<svg><foreignObject/></svg>',
    ]) {
      await expect(service.update({ logoUrl: svgDataUrl(evil) })).rejects.toThrow(
        BadRequestException,
      );
    }
  });
});
