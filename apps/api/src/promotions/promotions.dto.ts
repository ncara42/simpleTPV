import { PromoConditionType, PromoDiscountType } from '@simpletpv/db';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { MAX_PRICE } from '../common/limits.js';

// Umbral máximo razonable (nº de productos o € de ticket). Evita valores absurdos
// sin acotar de más un catálogo de promociones que es de central.
const MAX_THRESHOLD = 1_000_000;

export class CreatePromotionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(PromoConditionType)
  conditionType!: PromoConditionType;

  @IsInt()
  @Min(1)
  @Max(MAX_THRESHOLD)
  threshold!: number;

  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  discountValue!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(PromoConditionType)
  conditionType?: PromoConditionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_THRESHOLD)
  threshold?: number;

  @IsOptional()
  @IsEnum(PromoDiscountType)
  discountType?: PromoDiscountType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  discountValue?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
