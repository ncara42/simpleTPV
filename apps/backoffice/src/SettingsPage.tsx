import { Button } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getBranding, updateBranding } from './lib/branding.js';
import { formErrorMessage } from './lib/form-error.js';
import { usePageHeader } from './lib/pageHeader.js';

// Límite del logo alineado con el DTO de la API (~64KB reales en base64).
const LOGO_MAX_CHARS = 90_000;
const HEX = /^#[0-9a-f]{6}$/i;

// U-08: ajustes de la organización — sección Marca. El color elegido se aplica
// como tema (tokens --ui-brand*/--ui-primary*) en TODA la app (backoffice y TPV)
// vía useBranding al arrancar; aquí además hay preview en vivo del par color+logo.
export function SettingsPage() {
  usePageHeader('Ajustes', 'Marca de la organización: color corporativo y logo');
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

  return (
    <section className="catalog" data-testid="settings-page">
      <div className="table-panel settings-panel">
        <h3>Marca</h3>
        <p className="muted">
          El color corporativo se convierte en el color primario de toda la aplicación (botones,
          acentos y gráficos) y el logo sustituye a la «S» del menú lateral. Afecta al backoffice y
          al TPV de todas las tiendas.
        </p>

        <div className="settings-brand-grid">
          <div className="settings-field">
            <label htmlFor="brand-color">Color corporativo</label>
            <div className="settings-color-row">
              <input
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
              <input
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
          </div>

          <div className="settings-field">
            <label htmlFor="brand-logo">Logo (PNG, JPEG o SVG · máx. ~64KB)</label>
            <input
              id="brand-logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => onLogoFile(e.target.files?.[0])}
              data-testid="brand-logo-file"
            />
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
    </section>
  );
}
