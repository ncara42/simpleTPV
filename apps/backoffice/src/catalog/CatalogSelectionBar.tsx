import { FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

type FamilyOption = {
  value: string;
  label: string;
};

type Props = {
  count: number;
  familyOptions: FamilyOption[];
  onEdit: () => void;
  onMoveFamily: (familyId: string) => void;
  onDelete: () => void;
  onCancel: () => void;
};

/**
 * Barra de acciones de selección del catálogo: fila de botones flotantes (estilo TopBar) que
 * CatalogPage portaliza FUERA del card, alineada a la derecha. Sustituye a los botones de
 * selección que vivían en el slot de la TopBar.
 */
export function CatalogSelectionBar({
  count,
  familyOptions,
  onEdit,
  onMoveFamily,
  onDelete,
  onCancel,
}: Props) {
  const [moveOpen, setMoveOpen] = useState(false);

  const closeMove = (): void => setMoveOpen(false);

  // Conteo mostrado: retiene el último valor > 0 para que, al cerrarse la barra (count→0
  // tras deseleccionar), NO parpadee a «0 seleccionados» (más largo) durante la animación
  // de salida. La barra está oculta cuando count===0, así que solo importa el texto residual.
  const lastCountRef = useRef(count);
  if (count > 0) lastCountRef.current = count;
  const shownCount = count > 0 ? count : lastCountRef.current;

  return (
    <div
      className="cat-selbar"
      role="toolbar"
      aria-label="Acciones de la selección"
      data-testid="catalog-selection-bar"
    >
      <span className="cat-selbar__count" data-testid="selection-count">
        {shownCount} seleccionado{shownCount === 1 ? '' : 's'}
      </span>

      <button
        type="button"
        className="cat-selbar__btn"
        onClick={onEdit}
        data-testid="products-edit"
      >
        <Pencil size={15} aria-hidden="true" />
        Editar
      </button>

      <div className="cat-selbar__move">
        <button
          type="button"
          className="cat-selbar__btn"
          onClick={() => setMoveOpen((open) => !open)}
          data-testid="products-move-family"
          aria-haspopup="menu"
          aria-expanded={moveOpen}
        >
          <FolderInput size={15} aria-hidden="true" />
          Mover familia
        </button>
        {moveOpen && (
          <>
            <button
              type="button"
              className="cat-selbar__backdrop"
              aria-label="Cerrar"
              onClick={closeMove}
            />
            <div className="cat-selbar__pop" role="menu" data-testid="move-family-menu">
              {familyOptions.length === 0 ? (
                <span className="cat-selbar__pop-empty">No hay familias</span>
              ) : (
                familyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitem"
                    className="cat-selbar__pop-item"
                    onClick={() => {
                      onMoveFamily(opt.value);
                      closeMove();
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="cat-selbar__btn cat-selbar__btn--danger"
        onClick={onDelete}
        data-testid="products-delete"
      >
        <Trash2 size={15} aria-hidden="true" />
        Borrar
      </button>

      <button
        type="button"
        className="cat-selbar__btn"
        onClick={onCancel}
        data-testid="products-clear"
      >
        Cancelar
      </button>
    </div>
  );
}
