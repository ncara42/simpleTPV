import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import { FEATURE_KEYS } from './feature-flags.catalog.js';

// Fija un flag explícito (#127 B). `key` debe ser del catálogo; `storeId` opcional
// (ausente = default de la org, presente = override de esa tienda).
export class SetFeatureFlagDto {
  @IsIn(FEATURE_KEYS)
  key!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}
