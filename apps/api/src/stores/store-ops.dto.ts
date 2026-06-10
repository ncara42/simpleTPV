import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// Estado operativo MANUAL de la tienda (I-09 / D-10): solo lo que decide una
// persona. El estado del dispositivo NO entra aquí (D-10b: lo deriva devices).
export class UpdateStoreOpsDto {
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  incident?: string | null;
}
