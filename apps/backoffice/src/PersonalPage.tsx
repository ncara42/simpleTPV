import { useSearchParams } from 'react-router-dom';

import { useFeatures } from './lib/features.js';
import { TimeClockPage } from './TimeClockPage.js';
import { UsersPage } from './UsersPage.js';

// S-01 — Shell unificado de Personal. Reúne las dos vistas de gestión de personas
// (Equipo / Fichajes) bajo una sola entrada de menú y un control segmentado, igual
// que el shell de Inventario (S-02 fase A). La vista activa vive en la URL (`?vista=`)
// para que sea compartible y sobreviva al reload. Cada segmento monta la PÁGINA
// EXISTENTE tal cual: aquí solo va el shell + el selector, sin tocar la lógica interna
// de UsersPage/TimeClockPage.
//
// P003 — La page "Personal" siempre es visible; el segmento Fichajes solo aparece si
// `features.time_clock` está activo. Sin el flag, la vista cae a Equipo (siempre visible).

type Vista = 'equipo' | 'fichajes';

interface VistaMeta {
  id: Vista;
  label: string;
}

const VISTA_EQUIPO: VistaMeta = { id: 'equipo', label: 'Equipo' };
const VISTA_FICHAJES: VistaMeta = { id: 'fichajes', label: 'Fichajes' };

export function PersonalPage() {
  const features = useFeatures();
  const [params, setParams] = useSearchParams();
  const raw = params.get('vista');
  // P003: si el flag time_clock está apagado, Fichajes no existe como vista → se
  // fuerza Equipo aunque la URL pida `?vista=fichajes` (deep-link sin permiso).
  const vista: Vista = raw === 'fichajes' && features.time_clock ? 'fichajes' : 'equipo';

  // El segmento Fichajes solo se ofrece con el flag activo; Equipo siempre.
  const vistas: VistaMeta[] = features.time_clock ? [VISTA_EQUIPO, VISTA_FICHAJES] : [VISTA_EQUIPO];

  // Cambiar de vista preserva el resto de search params y solo fija `vista`. `replace`
  // evita acumular entradas de historial al alternar vistas.
  const selectVista = (next: Vista): void => {
    const updated = new URLSearchParams(params);
    updated.set('vista', next);
    setParams(updated, { replace: true });
  };

  return (
    <div className="inventory-page" data-testid="personal-page">
      <div className="inventory-views bo-tabs" role="tablist" aria-label="Vista de personal">
        {vistas.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`bo-tab${vista === id ? ' active' : ''}`}
            aria-pressed={vista === id}
            data-testid={`personal-view-${id}`}
            onClick={() => selectVista(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {vista === 'equipo' && <UsersPage />}
      {vista === 'fichajes' && <TimeClockPage />}
    </div>
  );
}
