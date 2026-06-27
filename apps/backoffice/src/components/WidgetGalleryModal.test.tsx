import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ITEM_SPECS } from '../lib/dashboard-layout.js';
import { GALLERY_CATEGORIES, GALLERY_ENTRIES } from '../widgets/gallery-catalog.js';
import { WidgetGalleryModal } from './WidgetGalleryModal.js';

const ALL_IDS = GALLERY_ENTRIES.map((e) => e.id);

function renderModal(overrides?: {
  availableIds?: string[];
  onPick?: (id: string) => void;
  onClose?: () => void;
}) {
  const onPick = overrides?.onPick ?? vi.fn();
  const onClose = overrides?.onClose ?? vi.fn();
  render(
    <WidgetGalleryModal
      availableIds={overrides?.availableIds ?? ALL_IDS}
      onPick={onPick}
      onClose={onClose}
    />,
  );
  return { onPick, onClose };
}

describe('WidgetGalleryModal', () => {
  it('cada entrada de la galería existe en el catálogo (ITEM_SPECS)', () => {
    // Arrange / Act / Assert: paridad galería ↔ catálogo (evita tarjetas que no se pueden añadir).
    for (const entry of GALLERY_ENTRIES) {
      expect(ITEM_SPECS[entry.id], `falta ${entry.id} en ITEM_SPECS`).toBeDefined();
    }
  });

  it('abre en la primera categoría con contenido y muestra sus widgets', () => {
    renderModal();

    // La primera sección poblada es «01 · KPIs» (las gráficas clásicas están en la 02).
    expect(screen.getByTestId('widget-gallery-modal')).toBeInTheDocument();
    expect(screen.getByTestId('widget-gallery-card-kpi-grid-connected')).toBeInTheDocument();
    expect(screen.getByTestId('widget-gallery-card-kpi-classic')).toBeInTheDocument();
  });

  it('añade el widget al hacer clic en su tarjeta', async () => {
    const user = userEvent.setup();
    const { onPick } = renderModal();

    await user.click(screen.getByTestId('widget-gallery-card-kpi-grid-connected'));

    expect(onPick).toHaveBeenCalledWith('kpi-grid-connected');
  });

  it('marca como «Añadido» y deshabilita los widgets ya presentes', async () => {
    const user = userEvent.setup();
    // kpi-classic NO está disponible (= ya en el lienzo) → tarjeta deshabilitada.
    const { onPick } = renderModal({ availableIds: ['kpi-grid-connected'] });

    const card = screen.getByTestId('widget-gallery-card-kpi-classic');
    expect(card).toBeDisabled();
    await user.click(card);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('filtra por el buscador (nombre o descripción)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByTestId('widget-gallery-search'), 'hora');

    expect(screen.getByTestId('widget-gallery-card-dash-hour')).toBeInTheDocument();
    expect(screen.queryByTestId('widget-gallery-card-dash-bars')).not.toBeInTheDocument();
  });

  it('muestra el placeholder de roadmap en una categoría vacía', async () => {
    // Elige dinámicamente una categoría aún sin widgets (se van rellenando por tandas).
    const used = new Set(GALLERY_ENTRIES.map((e) => e.category));
    const empty = GALLERY_CATEGORIES.find((c) => !used.has(c.id));
    if (!empty) return; // rediseño completo: ya no hay categorías vacías.

    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId(`widget-gallery-cat-${empty.id}`));

    expect(screen.getByText(/Aún no hay widgets en esta categoría/i)).toBeInTheDocument();
  });

  it('cierra con la tecla Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
