import { IsOptional, Matches, MaxLength } from 'class-validator';

// U-08: marca corporativa. `null` restaura el valor por defecto del sistema.
// El logo viaja como data-URL (PNG/JPEG/SVG) acotada — el servicio valida el
// contenido del SVG (sin scripts ni handlers) antes de persistir.
export class UpdateBrandingDto {
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'brandColor debe ser un color hex de 6 dígitos (#rrggbb)',
  })
  brandColor?: string | null;

  @IsOptional()
  @MaxLength(90_000, { message: 'El logo no puede superar ~64KB' })
  @Matches(/^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/, {
    message: 'logoUrl debe ser una data-URL base64 de PNG, JPEG o SVG',
  })
  logoUrl?: string | null;
}
