# Spec — Issue #71: Dashboards en el backoffice (Recharts)

| Campo      | Valor                                 |
| ---------- | ------------------------------------- |
| Fecha      | 2026-05-29                            |
| Estado     | En desarrollo                         |
| Issue      | #71 — `area:backoffice`, `mvp:week-5` |
| Blocked by | #70 (API de dashboards)               |

## 1. Objetivo

Pestaña "Dashboard" en el backoffice que consume la API de KPIs (#70): ventas hoy
vs ayer por tienda, facturación acumulada, ventas por familia, panel de roturas,
rankings de producto, todo con un selector de periodo global. Gráficas con Recharts.

## 2. Alcance y decisión sobre roles

El backoffice es **solo ADMIN** (`App.tsx`: un no-ADMIN ve `AccessDenied`). La spec
de la Semana 5 menciona "dashboard de tienda individual para MANAGER", pero abrir
el backoffice a MANAGER contradice el guard admin-only ya testeado en e2e
(`access.spec.ts`). Esa apertura queda **fuera de este slice**; en su lugar el
selector de tienda del dashboard cubre la vista "por tienda individual" para el
ADMIN. (Refinar la vista MANAGER es trabajo futuro: requeriría rediseñar el guard.)

## 3. UI

Nueva tab `dashboard` (la primera, por relevancia). Componentes:

- **Selector de periodo global**: today | yesterday | week | month + selector de tienda (todas / una). Estado local, propagado a todas las secciones.
- **KPI cards** (fila superior): facturación del periodo, ticket medio, UPT, % margen, tasa de descuento, tasa de devolución. La card de facturación incluye el delta hoy vs ayer (de `sales-today`) con color (verde sube / rojo baja).
- **Ventas hoy vs ayer por tienda**: gráfica de barras agrupadas (Recharts `BarChart`).
- **Ventas por familia**: gráfica de tarta (`PieChart`) con color de familia.
- **Panel de roturas**: cards con semáforo (eventos, abiertas, duración media, venta perdida estimada). Color según severidad (open > 0 → ámbar/rojo).
- **Rankings**: tabla con tabs (top ventas / top margen / peor rotación).

## 4. Datos

`lib/dashboard.ts` con tipos locales (espejo de las respuestas de #70) y funciones
`api.get('/dashboard/...', query)`. TanStack Query (`useQuery`) por sección, con
`queryKey` que incluye periodo + storeId para refetch al cambiar filtros.

El periodo `custom` no se expone en la UI del MVP (botones de periodo fijos);
`from`/`to` quedan disponibles en el tipo para uso futuro.

## 5. Estilos

Tailwind 4 (clases utilitarias) + CSS local `dashboard.css` para la rejilla de
cards y contenedores de gráfica. Formato de importes con `Intl.NumberFormat es-ES`.

## 6. Tests

- **Unit (vitest)**: helpers puros de formato (`fmtPct`, `fmtEur`, color de delta).
  Se añade config vitest al backoffice (hoy solo tiene Playwright).
- **E2E (Playwright)**: un ADMIN entra, ve la tab Dashboard, las KPI cards cargan
  con datos del seed y el selector de periodo cambia los valores. `data-testid` en
  cada bloque.

## 7. Fuera de alcance

- Sparklines en las cards (la card de facturación usa el delta numérico; sparkline = futuro).
- Vista MANAGER (ver §2). Periodo custom en UI.
