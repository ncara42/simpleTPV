# Plan de iteración 1 — Peticiones del user test de Ramón (por issues)

> Rehidratado del plan de Ultraplan. Se ejecuta sobre el código ya refactorizado
> (rama `feat/iteracion-1` sobre `refactor/tech-debt`), **issue por issue**, con gate
> entre cada uno y siguiendo `DESIGN_SYSTEM.md` para toda la UI. No se mergea a `main`.
>
> **Prerequisito de seguridad (auditoría 2026-06-05):** A-01/A-02 (modo demo con login
> falso) deben corregirse ANTES de cablear el backoffice a datos reales (IT-09).

## Estado del código (recordatorio)

Backend maduro (dashboard con KPIs/márgenes/hoy-vs-ayer, ventas, stock, proveedores,
compras, RLS). Frontends maduros pero en **modo demo**. Gaps verificados: SaleLine no
congela `costPrice`; `ListSalesQueryDto` no filtra por vendedor/familia/rango ni agrega;
no hay comparativa intradía; no hay arquetipos; no hay panel personalizable; no hay
API pública. Ver auditoría y refactor previos.

## Issues

### Fase 0 — Cimientos UI (design-system-driven)

- **IT-01 · DataTable reutilizable en `packages/ui`** [NUEVO]. Tabla controlada (columns/rows, sort, paginación, loading skeleton, toolbar/footer slots, emptyState) según `DESIGN_SYSTEM.md` §10.10. Resuelve PERF-01 + FILT-\* + UX. Test RTL. Export en index.
- **IT-02 · Sparkline + Chart en `packages/ui`** [NUEVO]. Componentes de gráfica sobre Recharts (reinstalar como dep de ui) o SVG, alineados al data-viz del design system §10.16.

### Fase 1 — Fidelidad analítica

- **IT-03 · Congelar `costPrice` (+`discountSource`) en SaleLine** [EXT, DB]. Migración + captura en `sales.service` + `dashboard` usa `sl.costPrice`. Habilita rentabilidad histórica fiable. Requiere Postgres efímero para el gate.

### Fase 2 — Filtros y vistas (PERF + FILT)

- **IT-04 · Filtros + agregados en `ListSalesQueryDto`/`findSales`** [EXT]. from/to, userId, familyId, estado; devuelve avgDiscountPct/avgMarginPct.
- **IT-05 · Export asíncrono de ventas (CSV)** [NUEVO]. Endpoint encola + descarga; UI no bloquea.
- **IT-06 · Página de Ventas real con DataTable + filtros + agregados (FILT-06)** [CABLEAR].

### Fase 3 — Estadística avanzada (STAT)

- **IT-07 · Comparativa intradía a la misma hora (STAT-01)** [EXT] + UI sparkline.
- **IT-08 · Margen/beneficio en panel (STAT-03)** [CABLEAR] (backend ya lo calcula).
- **IT-09 · Cableado demo→API real del backoffice** [CABLEAR] — tras A-01/A-02.
- **IT-10 · Franjas horarias (STAT-02)**, **IT-11 · Descuento medio por empleado (STAT-04)**, **IT-12 · Rotación + evolución de producto (STAT-05/06)**.

### Fase 4 — Contexto y arquetipos

- **IT-13 · Arquetipos de producto (§8)** [NUEVO, DB] — entidad `ProductArchetype` + lógica anti-rotura en stock.
- **IT-14 · Contexto (días cerrados/sin stock) (§9)**, **IT-15 · Producto nuevo vs establecido (§9)**.

### Fase 5–8 — Extensiones

- **IT-16 · Personalización (UserPreference + panel/tablas configurables)**.
- **IT-17 · B2B mayorista saliente**. **IT-18 · API pública de stock (API key, revisión de seguridad)**. **IT-19 · Limpieza UX (UX-01/02/03)**. **IT-20 · Chat de soporte**.

## Orden de ejecución

IT-01 → IT-02 → IT-03 → IT-04 → IT-05 → IT-07/IT-08 → IT-06/IT-09 (tras seguridad) → IT-10/11/12 → IT-13/14/15 → IT-16 → IT-17/18 → IT-19/20.

## Gate por issue

typecheck · lint (0 warnings nuevos) · knip (≤ baseline) · build · unit · E2E (TPV/backoffice) · DB issues: `test:int` con Postgres efímero. Commit atómico por issue (`feat: [IT-xx] …`). UI conforme a `DESIGN_SYSTEM.md`.
