import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @MinLength(2)
  name!: string;
}

export class PairDeviceDto {
  @IsString()
  @MinLength(6)
  pairingToken!: string;
}
