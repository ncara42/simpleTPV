import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

import { MAX_NAME_LENGTH } from '../common/limits.js';

export class CreateDeviceDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;
}

export class PairDeviceDto {
  // Token de 12 caracteres hexadecimales en mayúsculas (6 bytes). KEY-03.
  @IsString()
  @MinLength(12)
  @MaxLength(12)
  @Matches(/^[A-F0-9]{12}$/)
  pairingToken!: string;
}

export class ListDevicesQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
