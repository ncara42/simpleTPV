import { TimeClockType } from '@simpletpv/db';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateTimeClockEntryDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsEnum(TimeClockType)
  type!: TimeClockType;
}
