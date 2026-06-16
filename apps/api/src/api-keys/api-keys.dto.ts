import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsUUID()
  priceListId?: string;

  // TTL en días (caducidad). Ausente = sin caducidad. KEY-02.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  ttlDays?: number;
}
