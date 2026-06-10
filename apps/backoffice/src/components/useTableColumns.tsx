import type { DataTableColumn } from '@simpletpv/ui';
import { useState } from 'react';

import { readPref, usePreferences } from '../lib/preferences.js';
import { ConfigEditor, type OrderHidden, resolveConfig } from './ConfigEditor.js';

interface Options {
  /** Columnas ocultas por defecto (D-12) mientras el usuario no guarde nada. */
  defaultHidden?: string[];
  /** Prefijo de los testids de las casillas del editor (p. ej. 'col' → col-toggle-X). */
  toggleIdPrefix?: string;
  /** data-testid del editor desplegable. */
  editorTestId?: string;
  title?: string;
}

/**
 * Columnas configurables por usuario (IT-16/D-04) para cualquier DataTable:
 * visibilidad + orden persistidos en UserPreference bajo `prefKey`. Devuelve las
 * columnas efectivas y el editor desplegable; el botón que lo abre lo pinta la
 * page (cada una con su testid) usando `editorOpen`/`toggleEditor`.
 */
export function useTableColumns<Row>(
  prefKey: string,
  columns: DataTableColumn<Row>[],
  { defaultHidden = [], toggleIdPrefix = 'col', editorTestId, title = 'Columnas' }: Options = {},
) {
  const { prefs, setPref } = usePreferences();
  const [editorOpen, setEditorOpen] = useState(false);

  const items = columns.map((c) => ({
    id: c.key,
    label: typeof c.header === 'string' ? c.header : c.key,
  }));
  const allIds = items.map((c) => c.id);
  const cfg = resolveConfig(
    readPref<Partial<OrderHidden>>(prefs, prefKey, {}),
    allIds,
    defaultHidden,
  );

  const byKey = new Map(columns.map((c) => [c.key, c]));
  // Salvaguarda: si el usuario lo oculta todo, se muestran todas.
  const effectiveColumns = cfg.visible.length
    ? cfg.visible.map((id) => byKey.get(id)).filter((c): c is DataTableColumn<Row> => Boolean(c))
    : columns;

  const editor = editorOpen ? (
    <ConfigEditor
      title={title}
      items={items}
      order={cfg.order}
      hidden={cfg.hidden}
      onChange={(next) => setPref(prefKey, next)}
      {...(editorTestId ? { testid: editorTestId } : {})}
      toggleIdPrefix={toggleIdPrefix}
    />
  ) : null;

  return {
    effectiveColumns,
    editor,
    editorOpen,
    toggleEditor: () => setEditorOpen((o) => !o),
  };
}
