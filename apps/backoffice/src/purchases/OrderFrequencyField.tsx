import { Input, Select } from '@simpletpv/ui';
import { useState } from 'react';

/** Presets de periodicidad de compra (días entre pedidos al proveedor). */
const FREQUENCY_PRESETS = [
  { value: '', label: 'Sin definir' },
  { value: '7', label: 'Semanal (7 días)' },
  { value: '14', label: 'Quincenal (14 días)' },
  { value: '30', label: 'Mensual (30 días)' },
] as const;

const CUSTOM = 'custom';
const DEFAULT_CUSTOM_DAYS = '10';
const PRESET_VALUES: readonly string[] = FREQUENCY_PRESETS.map((p) => p.value);

/** Etiqueta legible de una periodicidad en días ('' = sin definir). */
export function frequencyLabel(days: number | null): string {
  const preset = FREQUENCY_PRESETS.find((p) => p.value === String(days ?? ''));
  if (preset) return preset.label;
  return `Cada ${days} días`;
}

/**
 * Selector de periodicidad de compra del proveedor: presets (semanal, quincenal,
 * mensual) + días personalizados. `value` es el nº de días como string ('' = sin
 * definir), el mismo formato string de los formularios de proveedor. Base de la
 * cobertura por defecto de la propuesta y de la futura automatización del pedido.
 */
export function OrderFrequencyField({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  // Modo personalizado con estado propio: si derivara del valor, teclear «7» en
  // el input saltaría de golpe al preset Semanal a mitad de escritura.
  const [isCustom, setIsCustom] = useState(() => !PRESET_VALUES.includes(value));

  return (
    <div className="order-frequency-field">
      <Select
        value={isCustom ? CUSTOM : value}
        ariaLabel="Periodicidad de compra"
        onChange={(v) => {
          if (v === CUSTOM) {
            setIsCustom(true);
            onChange(DEFAULT_CUSTOM_DAYS);
          } else {
            setIsCustom(false);
            onChange(v);
          }
        }}
        options={[...FREQUENCY_PRESETS, { value: CUSTOM, label: 'Personalizada…' }]}
        data-testid={testId}
      />
      {isCustom && (
        <Input
          type="number"
          min={1}
          max={365}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Días entre pedidos"
          placeholder="Días"
          data-testid={`${testId}-days`}
        />
      )}
    </div>
  );
}
