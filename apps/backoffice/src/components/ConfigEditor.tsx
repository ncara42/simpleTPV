import './config-editor.css';

export interface ConfigItem {
  id: string;
  label: string;
}
export interface OrderHidden {
  order: string[];
  hidden: string[];
}

// Saneado del pref de visibilidad/orden (IT-16): respeta el orden guardado, añade al
// final los ids nuevos y descarta los desconocidos (robusto ante versiones viejas).
export function resolveConfig(
  pref: Partial<OrderHidden> | undefined,
  allIds: string[],
): OrderHidden & { visible: string[] } {
  const savedOrder = (Array.isArray(pref?.order) ? pref.order : []).filter((id) =>
    allIds.includes(id),
  );
  const order = [...savedOrder, ...allIds.filter((id) => !savedOrder.includes(id))];
  const hidden = (Array.isArray(pref?.hidden) ? pref.hidden : []).filter((id) =>
    allIds.includes(id),
  );
  return { order, hidden, visible: order.filter((id) => !hidden.includes(id)) };
}

// Editor reutilizable de visibilidad + orden: una casilla por ítem + flechas ↑/↓.
export function ConfigEditor(props: {
  title: string;
  items: ConfigItem[];
  order: string[];
  hidden: string[];
  onChange: (next: OrderHidden) => void;
  testid?: string;
  toggleIdPrefix?: string;
}) {
  const prefix = props.toggleIdPrefix ?? 'config';
  const labelOf = (id: string): string => props.items.find((d) => d.id === id)?.label ?? id;
  const move = (i: number, dir: -1 | 1): void => {
    const j = i + dir;
    if (j < 0 || j >= props.order.length) return;
    const order = [...props.order];
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
    props.onChange({ order, hidden: props.hidden });
  };
  const toggle = (id: string): void => {
    const hidden = props.hidden.includes(id)
      ? props.hidden.filter((h) => h !== id)
      : [...props.hidden, id];
    props.onChange({ order: props.order, hidden });
  };
  return (
    <div className="config-editor" data-testid={props.testid}>
      <p className="config-editor-title">{props.title}</p>
      <ul>
        {props.order.map((id, i) => (
          <li key={id}>
            <label>
              <input
                type="checkbox"
                checked={!props.hidden.includes(id)}
                onChange={() => toggle(id)}
                data-testid={`${prefix}-toggle-${id}`}
              />
              {labelOf(id)}
            </label>
            <span className="config-editor-move">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Subir ${labelOf(id)}`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === props.order.length - 1}
                aria-label={`Bajar ${labelOf(id)}`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
