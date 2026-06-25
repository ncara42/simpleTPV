import { Button, Input, Select } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  FolderPlus,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { AddExistingProductsModal } from './components/AddExistingProductsModal.js';
import { useConfirm } from './components/ConfirmProvider.js';
import { Modal } from './components/Modal.js';
import {
  EMPTY_PRODUCT_FORM,
  ProductFormModal,
  type ProductFormState,
} from './components/ProductFormModal.js';
import {
  createFamily,
  deleteFamily,
  type FamilyNode,
  listFamilies,
  updateFamily,
} from './lib/families.js';
import { countDescendants, findNode, flattenTree } from './lib/family-tree.js';
import { formErrorMessage } from './lib/form-error.js';
import { fmtEur } from './lib/format.js';
import { usePageActions } from './lib/pageActions.js';
import { createProduct, listProducts, type Product, updateProduct } from './lib/products.js';

// Forma del JSON de intercambio del árbol de familias (export/import). Anidada
// con `children`, sin ids (se recrean en el import).
interface JsonFamily {
  name: string;
  color?: string | null;
  icon?: string | null;
  isArchetype?: boolean;
  children?: JsonFamily[];
}

interface FormState {
  id?: string;
  name: string;
  parentId: string | null;
  // Marcar el nodo como arquetipo (solo productos, sin subniveles).
  isArchetype: boolean;
  // Si el nodo editado ya tiene subniveles, no puede convertirse en arquetipo.
  hasChildren: boolean;
  color: string | null;
  icon: string | null;
}

// Paleta acotada (colores del seed + acentos del design system) e iconos
// curados (I-14): nada de pickers libres — consistencia visual garantizada.
const FAMILY_COLORS = [
  '#4CAF50',
  '#FFC107',
  '#E91E63',
  '#607D8B',
  '#0066cc',
  '#9C27B0',
  '#FF7043',
  '#14b8a6',
];
const FAMILY_ICONS = ['🌿', '💧', '🧴', '🛍️', '🍬', '🔥', '🌸', '📦'];

// Normaliza para buscar sin distinguir mayúsculas ni acentos.
const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

// Una columna del navegador = el contenido de un nodo (sus subfamilias + sus
// productos directos). La columna raíz tiene `ownerId: null` (las familias raíz).
interface NavColumn {
  ownerId: string | null;
  ownerName: string | null;
  // Arquetipo: el nodo dueño solo admite productos (no subfamilias).
  isArchetype: boolean;
  title: string;
  // Color heredado para los puntos de las familias sin color propio.
  color: string | null;
  families: FamilyNode[];
  products: Product[];
}

export function FamiliesPage({
  search: searchProp,
  onSearchChange,
}: {
  // Deep-link a Catálogo: retirado del navegador por diseño; se conserva en la API
  // (el shell sigue pasándolo) por compatibilidad, pero el navegador no lo usa.
  onOpenCatalogFamily?: (familyId: string) => void;
  // Filtro de búsqueda COMPARTIDO del shell de Inventario (controlado). Filtra los
  // elementos visibles dentro de cada columna del navegador.
  search?: string;
  onSearchChange?: (value: string) => void;
} = {}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState | null>(null);

  // Modo controlado: si el shell provee `search`, manda esa prop.
  const controlled = searchProp !== undefined;
  const [searchInner] = useState('');
  const search = controlled ? searchProp : searchInner;
  void onSearchChange; // el navegador no pinta su propia caja de búsqueda

  // Ruta abierta (drill-down): ids de raíz → nodo más profundo. Las columnas se
  // derivan de aquí.
  const [path, setPath] = useState<string[]>([]);
  // Producto resaltado (solo estética: marca el último producto sobre el que se
  // ha actuado). No abre columna.
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const { data: serverTree = [], isLoading } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });
  // Copia local editable (alta/edición/borrado optimistas; la demo no persiste la
  // reorganización en backend).
  const [tree, setTree] = useState<FamilyNode[] | null>(null);
  // Deriva la copia editable del árbol del servidor sin un efecto: se rehace solo
  // cuando cambia la referencia del árbol servido (evita la carrera del useEffect).
  const treeKey = serverTree;
  const [syncedFrom, setSyncedFrom] = useState<FamilyNode[] | null>(null);
  if (treeKey !== syncedFrom && serverTree.length) {
    setSyncedFrom(treeKey);
    setTree(serverTree.map((n) => ({ ...n, children: n.children.map((c) => ({ ...c })) })));
  }
  const view = tree ?? serverTree;

  // Productos completos: alimentan las hojas de cada columna y el contador REAL
  // por subárbol de cada familia (coherente con el filtro de Catálogo).
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });
  // Contador de productos del subárbol por nodo. Memoizado: el mapa de conteo
  // directo se reconstruye solo cuando cambia la lista de productos.
  const subtreeCount = useMemo(() => {
    const directCount = new Map<string, number>();
    for (const p of allProducts) {
      if (p.familyId) directCount.set(p.familyId, (directCount.get(p.familyId) ?? 0) + 1);
    }
    const count = (n: FamilyNode): number =>
      (directCount.get(n.id) ?? 0) + n.children.reduce((acc, c) => acc + count(c), 0);
    return count;
  }, [allProducts]);

  // Productos directos por familia (para las hojas de cada columna).
  const directProducts = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of allProducts) {
      if (!p.familyId) continue;
      const list = map.get(p.familyId);
      if (list) list.push(p);
      else map.set(p.familyId, [p]);
    }
    return map;
  }, [allProducts]);

  // ── Ruta válida + columnas derivadas ──
  const q = norm(search);
  const matches = (name: string): boolean => !q || norm(name).includes(q);

  // Prefijo de `path` que aún resuelve a nodos existentes (tras borrados).
  const validPath: FamilyNode[] = [];
  for (const id of path) {
    const node = findNode(view, id);
    if (!node) break;
    validPath.push(node);
  }

  const columns: NavColumn[] = [
    {
      ownerId: null,
      ownerName: null,
      isArchetype: false,
      title: 'Familias raíz',
      color: null,
      families: view.filter((r) => matches(r.name)),
      products: [],
    },
  ];
  let inheritedColor: string | null = null;
  for (const node of validPath) {
    inheritedColor = node.color ?? inheritedColor;
    columns.push({
      ownerId: node.id,
      ownerName: node.name,
      isArchetype: node.isArchetype,
      title: node.name,
      color: inheritedColor,
      families: node.children.filter((c) => matches(c.name)),
      products: (directProducts.get(node.id) ?? []).filter((p) => matches(p.name)),
    });
  }

  // Selecciona una familia en la columna `colIndex`: recorta la ruta a ese nivel
  // y abre la columna del nodo elegido.
  const openFamily = (colIndex: number, id: string): void => {
    setPath((prev) => [...prev.slice(0, colIndex), id]);
    setSelectedProductId(null);
  };

  // ── Export / Import (intercambio JSON del árbol) ──
  const [importing, setImporting] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(
    null,
  );

  const downloadJson = (filename: string, data: unknown): void => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toJsonFamily = (n: FamilyNode): JsonFamily => ({
    name: n.name,
    ...(n.color ? { color: n.color } : {}),
    ...(n.icon ? { icon: n.icon } : {}),
    isArchetype: n.isArchetype,
    ...(n.children.length ? { children: n.children.map(toJsonFamily) } : {}),
  });

  const handleExport = (): void => downloadJson('familias.json', view.map(toJsonFamily));

  // Alta de familia/subfamilia: abre el modal con el padre precargado.
  const openNewFamily = (parentId: string | null): void =>
    setForm({
      name: '',
      parentId,
      isArchetype: false,
      hasChildren: false,
      color: null,
      icon: null,
    });

  // Acciones de la vista en la TopBar (arriba-derecha, igual que el «Nuevo producto»
  // de Catálogo): export + import (iconos) y el CTA primario «Nueva familia».
  usePageActions(
    <>
      <button
        type="button"
        className="float-action-btn"
        onClick={handleExport}
        aria-label="Exportar familias"
        title="Exportar familias"
        data-testid="families-export"
      >
        <Download size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="float-action-btn"
        onClick={() => setImporting(true)}
        aria-label="Importar familias"
        title="Importar familias"
        data-testid="families-import"
      >
        <Upload size={17} aria-hidden="true" />
      </button>
      <Button
        onClick={() => openNewFamily(null)}
        data-testid="new-family"
        icon={<Plus size={16} aria-hidden="true" />}
      >
        Nueva familia
      </Button>
    </>,
  );

  const downloadTemplate = (): void =>
    downloadJson('familias-plantilla.json', [
      {
        name: 'Aceites',
        children: [
          { name: 'Aceites CBD', children: [{ name: 'Aceite CBD 10%', isArchetype: true }] },
        ],
      },
    ]);

  // Crea el árbol recursivamente: cada nodo con createFamily heredando el id del
  // padre ya creado. Acumula creadas + errores sin abortar el lote.
  const createTreeRecursive = async (
    nodes: JsonFamily[],
    parentId: string | null,
  ): Promise<{ created: number; errors: string[] }> => {
    let created = 0;
    const errors: string[] = [];
    for (const node of nodes) {
      const name = typeof node?.name === 'string' ? node.name.trim() : '';
      if (!name) {
        errors.push('Nodo sin nombre');
        continue;
      }
      try {
        const fam = await createFamily({
          name,
          parentId,
          ...(node.color ? { color: node.color } : {}),
          ...(node.icon ? { icon: node.icon } : {}),
          ...(typeof node.isArchetype === 'boolean' ? { isArchetype: node.isArchetype } : {}),
        });
        created += 1;
        if (Array.isArray(node.children) && node.children.length) {
          const sub = await createTreeRecursive(node.children, fam.id);
          created += sub.created;
          errors.push(...sub.errors);
        }
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }
    return { created, errors };
  };

  const onImportFile = async (file: File): Promise<void> => {
    setImportBusy(true);
    setImportResult(null);
    try {
      const data: unknown = JSON.parse(await file.text());
      const nodes = Array.isArray(data)
        ? (data as JsonFamily[])
        : Array.isArray((data as { familias?: JsonFamily[] })?.familias)
          ? (data as { familias: JsonFamily[] }).familias
          : null;
      if (!nodes) throw new Error('El JSON debe ser un array de familias (o { familias: [...] }).');
      const res = await createTreeRecursive(nodes, null);
      setImportResult(res);
      const fresh = await listFamilies();
      qc.setQueryData(['families'], fresh);
      setSyncedFrom(fresh);
      setTree(fresh.map((n) => ({ ...n, children: n.children.map((c) => ({ ...c })) })));
    } catch (e) {
      setImportResult({ created: 0, errors: [e instanceof Error ? e.message : 'JSON inválido'] });
    } finally {
      setImportBusy(false);
    }
  };

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['families'] });

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      f.id
        ? updateFamily(f.id, {
            name: f.name,
            isArchetype: f.isArchetype,
            color: f.color,
            icon: f.icon,
          })
        : createFamily({
            name: f.name,
            parentId: f.parentId,
            isArchetype: f.isArchetype,
            color: f.color,
            icon: f.icon,
          }),
    onSuccess: (saved, f) => {
      setTree((prev) => {
        const base = prev ?? view;
        if (f.id) {
          const rename = (list: FamilyNode[]): FamilyNode[] =>
            list.map((n) =>
              n.id === f.id
                ? { ...n, name: f.name, isArchetype: f.isArchetype, color: f.color, icon: f.icon }
                : { ...n, children: rename(n.children) },
            );
          return rename(base);
        }
        const node: FamilyNode = { ...saved, children: [] };
        if (!f.parentId) return [...base, node];
        const insert = (list: FamilyNode[]): FamilyNode[] =>
          list.map((n) =>
            n.id === f.parentId
              ? { ...n, children: [...n.children, node] }
              : { ...n, children: insert(n.children) },
          );
        return insert(base);
      });
      // Al crear una subfamilia, abre la del padre para que la nueva quede a la vista.
      if (!f.id && f.parentId) {
        const parentCol = columns.findIndex((c) => c.ownerId === f.parentId);
        if (parentCol === -1) {
          const parentPath = pathTo(view, f.parentId);
          if (parentPath) setPath(parentPath);
        }
      }
      setForm(null);
      invalidate();
    },
  });

  const delMut = useMutation({ mutationFn: (id: string) => deleteFamily(id) });

  const onDelete = async (node: FamilyNode): Promise<void> => {
    const n = countDescendants(node);
    if (n > 0) {
      const ok = await confirm({
        title: 'Borrar familia',
        message: `"${node.name}" tiene ${n} subfamilia(s). ¿Borrar todo el grupo?`,
        confirmLabel: 'Borrar',
        danger: true,
      });
      if (!ok) return;
    }
    delMut.mutate(node.id);
    setTree((prev) => removeNodeLocal(prev ?? view, node.id));
    // Recorta la ruta si el nodo borrado (o un ancestro) estaba abierto.
    setPath((prev) => {
      const idx = prev.indexOf(node.id);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
  };

  usePageHeader('Familias', 'Navegador de columnas · familias, subfamilias y productos');

  // ── Altas de producto (nuevo + existentes) sobre el nodo dueño de una columna ──
  const productMoveOptions = flattenTree(view).map((f) => ({
    value: f.node.id,
    label: `${'– '.repeat(f.depth)}${f.node.name}`,
  }));
  const invalidateProducts = () => {
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['families'] }); // contadores
  };
  const moveProductMut = useMutation({
    mutationFn: ({ id, familyId }: { id: string; familyId: string }) =>
      updateProduct(id, { familyId }),
    onSuccess: invalidateProducts,
  });
  const [addingExisting, setAddingExisting] = useState<FamilyNode | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState | null>(null);
  const productTarget = productForm?.familyId ? findNode(view, productForm.familyId) : null;
  const createProductMut = useMutation({
    mutationFn: (f: ProductFormState) =>
      createProduct({
        name: f.name,
        salePrice: Number(f.salePrice),
        sku: f.sku || null,
        barcode: f.barcode || null,
        costPrice: Number(f.costPrice ?? 0),
        taxRate: Number(f.taxRate ?? 21),
        familyId: f.familyId,
      }),
    onSuccess: () => {
      setProductForm(null);
      invalidateProducts();
    },
  });

  const header = (
    <div className="mc-head">
      <nav className="mc-crumbs" aria-label="Ruta de familias">
        <button
          type="button"
          className={`mc-crumb${validPath.length === 0 ? ' is-current' : ''}`}
          onClick={() => {
            setPath([]);
            setSelectedProductId(null);
          }}
        >
          Raíz
        </button>
        {validPath.map((node, i) => (
          <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <ChevronRight className="mc-crumb-sep" size={14} aria-hidden="true" />
            <button
              type="button"
              className={`mc-crumb${i === validPath.length - 1 ? ' is-current' : ''}`}
              onClick={() => {
                setPath(validPath.slice(0, i + 1).map((n) => n.id));
                setSelectedProductId(null);
              }}
            >
              {node.name}
            </button>
          </span>
        ))}
      </nav>
    </div>
  );

  return (
    <section className="catalog catalog--faceted">
      <div className="mc-nav" data-testid="fam-tree">
        {header}

        {isLoading ? (
          <p className="mc-col-empty">Cargando…</p>
        ) : view.length === 0 ? (
          <p className="mc-col-empty" data-testid="families-empty">
            Sin familias. Crea la primera.
          </p>
        ) : (
          <div className="mc-scroll">
            {/* Fila de cabeceras a TODO el ancho: la línea inferior cruza también el área
                vacía de la derecha (relleno flexible). */}
            <div className="mc-headrow">
              {columns.map((col) => (
                <div className="mc-col-head" key={col.ownerId ?? '__root__'}>
                  <span className="mc-col-title">{col.title}</span>
                </div>
              ))}
              <span className="mc-headrow-fill" aria-hidden="true" />
            </div>
            <div className="mc-colsrow" data-testid="fam-cols">
              {columns.map((col, colIndex) => {
                const activeId = validPath[colIndex]?.id ?? null;
                const isEmpty = col.families.length === 0 && col.products.length === 0;
                return (
                  <div className="mc-col" key={col.ownerId ?? '__root__'}>
                    <div className="mc-col-body">
                      {col.families.map((fam) => (
                        <NavFamilyRow
                          key={fam.id}
                          node={fam}
                          active={fam.id === activeId}
                          dotColor={fam.color ?? col.color}
                          count={subtreeCount(fam)}
                          onOpen={() => openFamily(colIndex, fam.id)}
                          onAddChild={() => openNewFamily(fam.id)}
                          onEdit={() =>
                            setForm({
                              id: fam.id,
                              name: fam.name,
                              parentId: fam.parentId,
                              isArchetype: fam.isArchetype,
                              hasChildren: fam.children.length > 0,
                              color: fam.color,
                              icon: fam.icon,
                            })
                          }
                          onDelete={() => void onDelete(fam)}
                        />
                      ))}

                      {col.products.length > 0 && (
                        <div className="mc-prods" data-testid="fam-product-list">
                          {col.products.map((p) => (
                            <NavProductRow
                              key={p.id}
                              product={p}
                              selected={p.id === selectedProductId}
                              moveOptions={productMoveOptions}
                              onSelect={() => setSelectedProductId(p.id)}
                              onMove={(familyId) => moveProductMut.mutate({ id: p.id, familyId })}
                            />
                          ))}
                        </div>
                      )}

                      {isEmpty && (q !== '' || col.isArchetype) && (
                        <p className="mc-col-empty" data-testid="fam-col-empty">
                          {q ? 'Sin coincidencias.' : 'Sin productos.'}
                        </p>
                      )}
                    </div>

                    {col.ownerId && (
                      <div className="mc-col-foot">
                        {!col.isArchetype && (
                          <button
                            type="button"
                            className="mc-foot-btn"
                            data-testid="fam-add-subfamily"
                            onClick={() => openNewFamily(col.ownerId)}
                          >
                            <FolderPlus size={14} aria-hidden="true" />
                            Subfamilia
                          </button>
                        )}
                        <button
                          type="button"
                          className="mc-foot-btn"
                          data-testid="fam-panel-add-product"
                          onClick={() => {
                            const owner = findNode(view, col.ownerId!);
                            if (owner)
                              setProductForm({ ...EMPTY_PRODUCT_FORM, familyId: owner.id });
                          }}
                        >
                          <PackagePlus size={14} aria-hidden="true" />
                          Producto
                        </button>
                        <button
                          type="button"
                          className="mc-foot-btn"
                          data-testid="fam-panel-add-existing"
                          onClick={() => {
                            const owner = findNode(view, col.ownerId!);
                            if (owner) setAddingExisting(owner);
                          }}
                        >
                          <Package size={14} aria-hidden="true" />
                          Existentes
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {productForm && (
        <ProductFormModal
          form={productForm}
          onChange={setProductForm}
          onSubmit={() => createProductMut.mutate(productForm)}
          onClose={() => setProductForm(null)}
          familyOptions={productMoveOptions}
          pending={createProductMut.isPending}
          errorMessage={
            createProductMut.isError
              ? formErrorMessage(createProductMut.error, 'No se pudo crear el producto.')
              : null
          }
          title={`Nuevo producto en ${productTarget?.name ?? 'el nodo'}`}
          primaryLabel={createProductMut.isPending ? 'Creando…' : 'Crear'}
        />
      )}

      {addingExisting && (
        <AddExistingProductsModal
          targetFamilyId={addingExisting.id}
          targetFamilyName={addingExisting.name}
          families={view}
          onClose={() => setAddingExisting(null)}
        />
      )}

      {form && (
        <Modal
          onClose={() => setForm(null)}
          className="modal--form"
          testId="family-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate(form);
          }}
        >
          <h3>
            {form.id ? 'Editar familia' : form.parentId ? 'Nueva subfamilia' : 'Nueva familia'}
          </h3>
          <label>
            Nombre
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="family-name"
            />
          </label>
          <div className="fam-style-pickers">
            <span className="form-section-title">Color</span>
            <div className="fam-color-palette" role="radiogroup" aria-label="Color de la familia">
              {FAMILY_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`fam-color-swatch${form.color === c ? ' is-active' : ''}`}
                  style={{ background: c }}
                  aria-pressed={form.color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setForm({ ...form, color: form.color === c ? null : c })}
                  data-testid={`family-color-${c.slice(1)}`}
                />
              ))}
            </div>
            <span className="form-section-title">Icono</span>
            <div className="fam-icon-palette" role="radiogroup" aria-label="Icono de la familia">
              {FAMILY_ICONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  className={`fam-icon-swatch${form.icon === i ? ' is-active' : ''}`}
                  aria-pressed={form.icon === i}
                  onClick={() => setForm({ ...form, icon: form.icon === i ? null : i })}
                  data-testid="family-icon-option"
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <label className="fam-archetype-toggle">
            <input
              type="checkbox"
              checked={form.isArchetype}
              disabled={form.hasChildren}
              onChange={(e) => setForm({ ...form, isArchetype: e.target.checked })}
              data-testid="family-archetype"
            />
            <span>Es un arquetipo (agrupa productos casi idénticos; no admite subfamilias)</span>
          </label>
          {form.hasChildren && (
            <p className="muted">
              Tiene subfamilias: vacíalas para poder convertirlo en arquetipo.
            </p>
          )}
          {saveMut.isError && (
            <p className="form-error">{formErrorMessage(saveMut.error, 'No se pudo guardar.')}</p>
          )}
          <div className="modal-foot">
            <button type="button" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <Button type="submit" disabled={saveMut.isPending} data-testid="family-save">
              {saveMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Modal>
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="families-import-modal"
          ariaLabel="Importar familias desde JSON"
        >
          <h3>Importar familias desde JSON</h3>
          <p className="muted">
            Sube un <code>.json</code> con un árbol de familias anidadas (<code>name</code>,{' '}
            <code>color?</code>, <code>icon?</code>, <code>isArchetype?</code>,{' '}
            <code>children?</code>). Se crean bajo la raíz.
          </p>
          <button type="button" className="link-btn" onClick={downloadTemplate}>
            Descargar plantilla JSON
          </button>
          <label className="settings-file">
            <span>Elegir archivo JSON</span>
            <input
              className="settings-file-input"
              type="file"
              accept="application/json,.json"
              data-testid="families-json-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
              }}
            />
          </label>
          {importBusy && <p className="muted">Importando…</p>}
          {importResult && (
            <p
              className={importResult.errors.length ? 'form-error' : 'muted'}
              data-testid="families-import-result"
            >
              {importResult.created} familia(s) creada(s)
              {importResult.errors.length ? ` · ${importResult.errors.length} error(es)` : ''}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" onClick={() => setImporting(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Fila de familia (carpeta navegable): punto de color + nombre + ARQ + contador
// + chevron. Las acciones (subfamilia / editar / borrar) ceden el sitio del
// contador al pasar el ratón o en la fila activa.
function NavFamilyRow({
  node,
  active,
  dotColor,
  count,
  onOpen,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: FamilyNode;
  active: boolean;
  dotColor: string | null;
  count: number;
  onOpen: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(onOpen, 170);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  return (
    <div
      className={`mc-row mc-row--fam${active ? ' is-active' : ''}`}
      data-testid="fam-row"
      data-fam-id={node.id}
      role="button"
      tabIndex={0}
      aria-current={active}
      onClick={onOpen}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span
        className="mc-dot"
        style={dotColor ? { background: dotColor } : undefined}
        aria-hidden="true"
      />
      <span className="mc-name">
        <span className="mc-name-text fam-name">{node.name}</span>
      </span>
      <span className="mc-count" data-testid="fam-count">
        {count} prod.
      </span>
      <span className="mc-fam-actions" onClick={(e) => e.stopPropagation()}>
        {!node.isArchetype && (
          <button
            type="button"
            className="mc-act"
            data-testid="fam-add-child"
            title="Añadir subfamilia"
            aria-label={`Añadir subfamilia a ${node.name}`}
            onClick={onAddChild}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="mc-act"
          title="Editar"
          aria-label={`Editar ${node.name}`}
          onClick={onEdit}
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mc-act mc-act--danger"
          title="Borrar"
          aria-label={`Borrar ${node.name}`}
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </span>
      <ChevronRight className="mc-chev" size={16} aria-hidden="true" />
    </div>
  );
}

// Fila de producto (hoja): nombre + precio. El precio cede el sitio al selector
// "Mover a…" al pasar el ratón.
function NavProductRow({
  product,
  selected,
  moveOptions,
  onSelect,
  onMove,
}: {
  product: Product;
  selected: boolean;
  moveOptions: { value: string; label: string }[];
  onSelect: () => void;
  onMove: (familyId: string) => void;
}) {
  return (
    <div
      className={`mc-row mc-row--prod${selected ? ' is-active' : ''}`}
      data-testid="fam-product-item"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="mc-prod-name fam-product-name">{product.name}</span>
      <span className="mc-prod-price">{fmtEur(Number(product.salePrice))}</span>
      <span className="mc-prod-move" onClick={(e) => e.stopPropagation()}>
        <Select
          value=""
          onChange={(value) => {
            if (value && value !== product.familyId) onMove(value);
          }}
          triggerLabel="Mover"
          options={[{ value: '', label: 'Mover a…' }, ...moveOptions]}
          ariaLabel={`Mover ${product.name} a otro nodo`}
          data-testid="fam-product-move"
        />
      </span>
    </div>
  );
}

// Elimina un nodo por id en cualquier nivel (recursivo, inmutable). Local: solo
// la copia editable del árbol.
function removeNodeLocal(tree: FamilyNode[], id: string): FamilyNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNodeLocal(n.children, id) }));
}

// Ruta de ids (raíz → nodo) hasta `id`, o null si no existe.
function pathTo(tree: FamilyNode[], id: string): string[] | null {
  for (const n of tree) {
    if (n.id === id) return [n.id];
    const sub = pathTo(n.children, id);
    if (sub) return [n.id, ...sub];
  }
  return null;
}
