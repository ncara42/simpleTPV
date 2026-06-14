import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

import type { CompareMode, DashboardPeriod } from './period.js';

// Query común a los endpoints con rango temporal. `period` por defecto `today`.
// `from`/`to` solo son obligatorios (y usados) cuando period=custom; el service
// los valida en resolvePeriod. storeId opcional filtra a una tienda (vista MANAGER).
export class DashboardPeriodQueryDto {
  @IsOptional()
  @IsEnum(['today', 'yesterday', 'week', 'month', 'custom'], {
    message: 'period debe ser today|yesterday|week|month|custom',
  })
  period?: DashboardPeriod;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

// Rankings admite además un límite de filas (top N). Hereda el rango temporal.
export class ProductRankingsQueryDto extends DashboardPeriodQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

// Comparativa de ventas por tienda: storeId opcional + modo de comparación
// (`compare`, por defecto `day` = hoy vs ayer). No usa el selector de periodo.
export class SalesTodayQueryDto {
  @IsOptional()
  @IsEnum(['day', 'month', 'year'], { message: 'compare debe ser day|month|year' })
  compare?: CompareMode;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}
