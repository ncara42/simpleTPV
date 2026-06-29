import { Button, evaluateBrandColor, Input } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Palette, Plug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ApiKeysSection } from './ApiKeysSection.js';
import { getBranding, updateBranding } from './lib/branding.js';
import { formErrorMessage } from './lib/form-error.js';
import { readThemeSurfaces } from './lib/theme-surfaces.js';

// Límite del logo alineado con el DTO de la API (~64KB reales en base64).
const LOGO_MAX_CHARS = 90_000;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_BRAND = '#0e7c6b';

// U-08: ajustes de la organización — sección Marca. El color elegido se aplica
// como tema (tokens --ui-brand*/--ui-primary*) en TODA la app (backoffice y TPV)
// vía useBranding al arrancar; aquí además hay preview en vivo del par color+logo.
export function SettingsPage() {
  usePageHeader('Ajustes', 'Marca de la organización e integraciones');
  const qc = useQueryClient();
  const { data: branding } = useQuery({ queryKey: ['org-branding'], queryFn: getBranding });

  const [color, setColor] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Sincroniza el form cuando llega (o cambia) la marca persistida.
  useEffect(() => {
    setColor(branding?.brandColor ?? '');
    setLogo(branding?.logoUrl ?? null);
  }, [branding?.brandColor, branding?.logoUrl]);

  const save = useMutation({
    mutationFn: () =>
      updateBranding({
        brandColor: color === '' ? null : color,
        logoUrl: logo,
      }),
    onSuccess: () => {
      setError('');
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['org-branding'] });
    },
    onError: (e) => {
      setSaved(false);
      setError(formErrorMessage(e, 'No se pudo guardar la marca.'));
    },
  });

  const onLogoFile = (file: File | undefined): void => {
    setSaved(false);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setError('El logo debe ser PNG, JPEG o SVG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (dataUrl.length > LOGO_MAX_CHARS) {
        setError('El logo no puede superar ~64KB.');
        return;
      }
      setError('');
      setLogo(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const colorValid = color === '' || HEX.test(color);

  // Aviso de legibilidad WCAG: evalúa el color elegido contra las superficies
  // reales del tema vigente. No bloquea el guardado; es una guía para el usuario.
  const effectiveColor = HEX.test(color) ? color : DEFAULT_BRAND;
  const contrast = useMemo(
    () => evaluateBrandColor(effectiveColor, readThemeSurfaces()),
    [effectiveColor],
  );

  return (
    <section className="catalog settings-page" data-testid="settings-page">
      <div className="help-section">
        <div className="help-section-head">
          <h3 className="help-title">
            <Palette size={18} aria-hidden="true" /> Marca
          </h3>
          <p className="help-intro">
            El color corporativo se convierte en el color primario de toda la aplicación (botones,
            acentos y gráficos) y el logo sustituye a la «S» del menú lateral. Afecta al backoffice
            y al TPV de todas las tiendas.
          </p>
        </div>

        <div className="settings-grid">
          <div className="settings-field">
            <h4 className="settings-field-title">Color corporativo</h4>
            <label htmlFor="brand-color">Color corporativo</label>
            <div className="settings-color-row">
              <Input
                id="brand-color"
                type="color"
                value={HEX.test(color) ? color : '#0e7c6b'}
                onChange={(e) => {
                  setColor(e.target.value);
                  setSaved(false);
                }}
                data-testid="brand-color-picker"
                aria-label="Selector de color corporativo"
              />
              <Input
                type="text"
                className="settings-hex"
                placeholder="#0e7c6b"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value.trim());
                  setSaved(false);
                }}
                data-testid="brand-color-hex"
                aria-label="Color corporativo en hexadecimal"
              />
            </div>
            {!colorValid && <p className="settings-error">Formato esperado: #rrggbb</p>}
            {colorValid && !contrast.ok && (
              <p
                className="settings-warning"
                role="status"
                aria-live="polite"
                data-testid="settings-color-warning"
              >
                Este color puede no leerse bien. Contraste del texto del botón{' '}
                {contrast.buttonText.ratio.toFixed(1)}:1 y del color sobre fondo blanco{' '}
                {contrast.onSurface.ratio.toFixed(1)}:1 (mín. recomendado 4,5:1).
              </p>
            )}
          </div>

          <div className="settings-field">
            <h4 className="settings-field-title">Logotipo</h4>
            <label htmlFor="brand-logo">Logo (PNG, JPEG o SVG · máx. ~64KB)</label>
            <label className="settings-file">
              <input
                id="brand-logo"
                className="settings-file-input"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => onLogoFile(e.target.files?.[0])}
                data-testid="brand-logo-file"
              />
              <span>Elegir archivo</span>
            </label>
            <div className="settings-logo-preview" data-testid="brand-logo-preview">
              {logo ? <img src={logo} alt="Logo de la organización" /> : <span>S</span>}
            </div>
          </div>
        </div>

        {error && (
          <p className="settings-error" data-testid="settings-error">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <Button
            icon={<Check size={16} />}
            onClick={() => save.mutate()}
            disabled={!colorValid || save.isPending}
            data-testid="settings-save"
          >
            {save.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar marca'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setColor('');
              setLogo(null);
              setSaved(false);
            }}
            data-testid="settings-reset"
          >
            Restaurar por defecto
          </Button>
        </div>
      </div>

      {/* Integraciones · Claves API. Reubicada desde Ayuda: la gestión de claves
          API (acceso externo de solo lectura al stock) vive ahora en Ajustes. */}
      <div className="help-section" data-testid="settings-integrations">
        <div className="help-section-head">
          <h3 className="help-title">
            <Plug size={18} aria-hidden="true" /> Integraciones · Claves API
          </h3>
          <p className="help-intro">
            Acceso externo de solo lectura al stock para integraciones (webs, ERPs…). La clave se
            muestra una sola vez y es revocable.
          </p>
        </div>
        <ApiKeysSection />
      </div>
    </section>
  );
}
