import { TimeClockType } from '@simpletpv/db';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateTimeClockEntryDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsEnum(TimeClockType)
  type!: TimeClockType;
}

export class TimeClockHistoryQueryDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// Histórico cross-tienda para gestión (backoffice): TODO opcional. `storeId` no es
// obligatorio (a diferencia de TimeClockHistoryQueryDto) porque la vista agrega las
// jornadas de TODAS las tiendas de la organización. Solo ADMIN/MANAGER (org-wide).
export class TimeClockHistoryAllQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// Histórico del propio empleado (TPV): NO acepta `userId` — el endpoint lo fuerza
// al del token, así un CLERK nunca puede leer fichajes de otro usuario.
export class TimeClockHistoryMeQueryDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
