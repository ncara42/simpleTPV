import { Button, Input } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { FamilyNode } from '../lib/families.js';
import { findNode } from '../lib/family-tree.js';
import { fmtEur } from '../lib/format.js';
import { listProducts } from '../lib/products.js';
import { useAssignProductsToFamily } from '../lib/use-assign-products-to-family.js';

interface AddExistingProductsModalProps {
  // Nodo destino (familia, subfamilia o arquetipo): a él se asignan los productos.
  targetFamilyId: string;
  targetFamilyName: string;
  // Árbol completo, para resolver el nombre de la familia ACTUAL de cada producto
  // (badge "Ya en {familia}") con `findNode`.
  families: FamilyNode[];
  onClose: () => void;
  // Se invoca tras un alta con al menos un éxito (el panel puede reaccionar).
  onAdded?: () => void;
}

// Modal del picker de productos existentes (S-18, P108/P110/P112). Busca por
// nombre (reusa `listProducts(search)`), permite multi-selección por checkbox y,
// para los productos que YA pertenecen al nodo destino, muestra un badge "Ya en
// {familia}" y los EXCLUYE de la selección (checkbox deshabilitado). Confirmar
// dispara `useAssignProductsToFamily`; en error parcial, mensaje inline (no hay
// ToastProvider en el backoffice). Agnóstico de FamiliesPage para que S-02 lo
// reutilice pasando `families` y `targetFamilyId` por props.
export function AddExistingProductsModal({
  targetFamilyId,
  targetFamilyName,
  families,
  onClose,
  onAdded,
}: AddExistingProductsModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search),
  });

  const assignMut = useAssignProductsToFamily();

  // Nombre de la familia ACTUAL de un producto, o null si es huérfano o si ya
  // está en el nodo destino (en cuyo caso el badge dice "este nodo").
  const familyNameOf = (familyId: string | null): string | null =>
    familyId ? (findNode(families, familyId)?.name ?? null) : null;

  // Productos seleccionables: los que NO están ya en el nodo destino. Los demás
  // se listan pero con el checkbox deshabilitado y el badge "Ya en {familia}".
  const selectableIds = useMemo(
    () => products.filter((p) => p.familyId !== targetFamilyId).map((p) => p.id),
    [products, targetFamilyId],
  );

  const toggle = (id: string): void =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Solo los seleccionables que siguen en la selección (defensa ante cambios de
  // búsqueda que ya no muestran un id antes seleccionado).
  const confirmIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );

  const confirm = (): void => {
    if (confirmIds.length === 0) return;
    assignMut.mutate(
      { productIds: confirmIds, familyId: targetFamilyId },
      {
        onSuccess: (res) => {
          // Éxito (total o parcial): refresca el panel y, si TODO entró, cierra.
          // Si algo falló, se mantiene abierto y se muestra el aviso inline.
          if (res.ok > 0) onAdded?.();
          if (res.failed === 0) onClose();
        },
      },
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--form fam-add-existing"
        data-testid="fam-add-existing-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Añadir productos existentes a ${targetFamilyName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Añadir productos a {targetFamilyName}</h3>
        <p className="muted">
          Busca y selecciona productos ya creados (incluidos los que no tienen familia) para
          añadirlos a este nodo.
        </p>
        <Input
          autoFocus
          type="search"
          placeholder="Buscar producto por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="fam-add-existing-search"
          aria-label="Buscar producto"
        />

        {isLoading ? (
          <p className="muted" data-testid="fam-add-existing-loading">
            Cargando…
          </p>
        ) : products.length === 0 ? (
          <p className="catalog-empty" data-testid="fam-add-existing-empty">
            Sin productos para la búsqueda.
          </p>
        ) : (
          <ul className="fam-add-existing-list" data-testid="fam-add-existing-list">
            {products.map((p) => {
              const alreadyHere = p.familyId === targetFamilyId;
              const otherFamilyName = p.familyId && !alreadyHere ? familyNameOf(p.familyId) : null;
              const isChecked = selected.has(p.id);
              return (
                <li
                  key={p.id}
                  className={`fam-add-existing-item${alreadyHere ? ' is-disabled' : ''}`}
                  data-testid="fam-add-existing-item"
                  data-product-id={p.id}
                >
                  <label className="fam-add-existing-row">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={alreadyHere || assignMut.isPending}
                      onChange={() => toggle(p.id)}
                      data-testid="fam-add-existing-check"
                      aria-label={`Seleccionar ${p.name}`}
                    />
                    <span className="fam-product-name">{p.name}</span>
                    <span className="fam-product-price">{fmtEur(Number(p.salePrice))}</span>
                    {alreadyHere ? (
                      <span className="fam-badge" data-testid="fam-add-existing-here">
                        Ya en {targetFamilyName}
                      </span>
                    ) : otherFamilyName ? (
                      <span
                        className="fam-badge fam-badge--soft"
                        data-testid="fam-add-existing-other"
                      >
                        Ya en {otherFamilyName}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {assignMut.data && assignMut.data.failed > 0 && (
          <p className="form-error" data-testid="fam-add-existing-error">
            {assignMut.data.failed} producto(s) no se pudieron añadir
            {assignMut.data.ok > 0 ? ` (${assignMut.data.ok} sí)` : ''}. Inténtalo de nuevo.
          </p>
        )}
        {assignMut.isError && (
          <p className="form-error" data-testid="fam-add-existing-error">
            No se pudieron añadir los productos. Inténtalo de nuevo.
          </p>
        )}

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <Button
            type="button"
            onClick={confirm}
            disabled={confirmIds.length === 0 || assignMut.isPending}
            data-testid="fam-add-existing-confirm"
          >
            {assignMut.isPending
              ? 'Añadiendo…'
              : confirmIds.length > 0
                ? `Añadir ${confirmIds.length}`
                : 'Añadir'}
          </Button>
        </div>
      </div>
    </div>
  );
}
