# Spec — Rediseño UI/UX Vercel-style por fases

| Campo       | Valor                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Fecha       | 2026-05-30                                                             |
| Estado      | Aprobado para plan de implementación                                   |
| Alcance     | UI/UX de TPV, backoffice y login. Sin cambios de lógica de negocio.    |
| Referencias | `packages/ui`, `apps/tpv/src`, `apps/backoffice/src`, spec F4 frontend |

## 1. Objetivo

Rediseñar la experiencia visual y operativa de simpleTPV para que cualquier
persona sin formación pueda entender qué hacer en cada pantalla. El estilo debe
acercarse a Vercel: limpio, compacto, con mucho blanco, bordes finos, tipografía
moderna, navegación clara y paneles densos pero legibles.

El rediseño no debe alterar lógica, permisos, endpoints, queries, stores,
validaciones, estados de dominio ni contratos E2E. Si una mejora requiere tocar
algo fuera de presentación o composición visual, se debe parar y pedir
confirmación.

## 2. Contexto Actual

La UI está funcional pero fragmentada:

- `packages/ui` solo tiene `Button`, `LoginForm` y `cn`.
- `apps/tpv/src/sale.css` concentra casi todo el estilo del TPV.
- `apps/backoffice/src/catalog.css` y `dashboard.css` concentran estilos de
  backoffice.
- La intención original fue `shadcn-style`, pero no hay `components.json`, CLI
  shadcn ni librería de componentes amplia.
- No hay runtime Next/Vercel. El producto es React + Vite.

## 3. Principios de Diseño

1. **Claridad antes que estética.** Cada pantalla debe responder: dónde estoy,
   qué puedo hacer ahora, qué falta para avanzar y qué pasó si algo falla.
2. **Una sola casa para todo.** El backoffice debe sentirse como una app única:
   shell estable, navegación persistente y vistas densas dentro del mismo marco.
3. **TPV operativo.** En venta, las acciones importantes deben estar siempre a
   mano: tienda, caja, búsqueda, productos, carrito y cobro.
4. **Compacto, no apretado.** Dashboard y tablas deben mostrar más información
   por pantalla sin perder jerarquía ni tactilidad.
5. **Estados explícitos.** Vacío, cargando, error, bloqueado, degradado,
   abierto/cerrado, pendiente/fallido y peligro deben tener patrones visuales
   consistentes.
6. **Sin dependencia de formación.** Los textos deben ser directos y accionables:
   "Abre la caja para cobrar", "Busca un producto o escanéalo", "No hay ventas
   en este periodo".
7. **Cambios pequeños y verificables.** El rediseño se entrega por fases para
   reducir riesgo.

## 4. Alcance

Incluido:

- Sistema visual compartido en `packages/ui`: tokens, botones, inputs, paneles,
  tabs, badges, empty states y utilidades de layout.
- Login unificado para TPV y backoffice.
- Shell de backoffice con navegación compacta y persistente.
- Dashboard backoffice más denso y escaneable.
- Tablas y formularios del backoffice con jerarquía consistente.
- Shell de TPV orientado al flujo de venta.
- Mejoras visuales de caja, producto, carrito, cobro, devolución y traspasos.
- Revisión responsive básica para escritorio, tablet y móvil.

Excluido:

- Cambiar endpoints, API client, stores Zustand, React Query keys o DTOs.
- Cambiar permisos, roles, validaciones o reglas de negocio.
- Añadir React Router si no es estrictamente necesario para UI.
- Cambiar el despliegue, Docker, Dokploy, CI o configuración de backend.
- Migrar a Next.js o Vercel.
- Instalar shadcn/ui completo sin aprobación explícita.

## 5. Dirección Visual

La base visual será "Vercel-style operativo":

- Fondo `#fafafa` o blanco, paneles blancos, bordes `#e5e5e5`.
- Texto principal casi negro, secundarios en grises neutros.
- Botón primario negro, secundarios blancos con borde, peligro en rojo.
- Radio pequeño/medio: 6-8px en controles y paneles.
- Sombras mínimas o inexistentes; la separación se apoya en borde y espacio.
- Tipografía sans moderna. Geist puede mantenerse como preferencia visual, pero
  sin introducir acoplamiento a Vercel.
- Densidad alta en dashboard y tablas: menos tarjetas grandes, más filas claras.

## 6. Arquitectura UI

### 6.1 `packages/ui`

Crear o consolidar componentes presentacionales reutilizables:

- `Button` con variantes `primary`, `secondary`, `ghost`, `danger`.
- `Input`, `Select` y `Textarea` con estados focus/error/disabled.
- `Panel` para secciones de dashboard, tablas y formularios.
- `Tabs` visuales para navegación local.
- `Badge` para estados y roles.
- `EmptyState` para ausencia de datos con acción sugerida.
- `AppShell` o clases base para cabecera/sidebar, si encaja sin forzar lógica.

Estos componentes no deben incluir llamadas API ni lógica de dominio. Solo
presentación, accesibilidad básica y composición.

### 6.2 Estilos Globales

Centralizar tokens y reset visual en el paquete UI o en estilos compartidos:

- Variables CSS para color, radio, spacing, tipografía, border y focus ring.
- Utilidades consistentes para tablas, toolbars, paneles, modales y formularios.
- Reducir duplicación entre `sale.css`, `catalog.css` y `dashboard.css` sin
  hacer una refactorización general de lógica.

## 7. UX Backoffice

El backoffice será la primera fase funcional tras la base visual.

Diseño:

- Layout con sidebar izquierda compacta y header superior.
- Navegación visible: Dashboard, Ventas, Catálogo, Stock, Compras, VeriFactu,
  Usuarios, Tiendas.
- Header con contexto de página, acción principal y cerrar sesión.
- Vistas con toolbar superior: búsqueda/filtros/periodo/tienda.
- Tablas densas con columnas alineadas, números tabulares y badges de estado.
- Formularios en paneles o modales sencillos, sin tarjetas anidadas.

Dashboard:

- KPI cards compactas en una sola fila cuando haya espacio.
- Gráficas en paneles limpios con títulos cortos.
- Rankings y roturas como tablas/listas escaneables.
- Filtros de periodo y tienda siempre arriba.

## 8. UX TPV

El TPV se migrará después de estabilizar backoffice.

Diseño:

- Header operativo: tienda activa, caja abierta/cerrada, estado servidor,
  cerrar sesión.
- Zona central: búsqueda grande, familias como chips, grid de productos.
- Carrito fijo a la derecha en desktop, panel inferior o drawer visual en móvil.
- Botón de cobro dominante, pero claramente bloqueado si falta caja o conexión.
- Caja, devolución y traspasos accesibles desde navegación simple.
- Textos de bloqueo accionables: explicar qué hacer, no solo qué falló.

Principio operativo:

- El flujo básico debe entenderse sin manual: abrir caja → buscar/escanear →
  pulsar producto → cobrar → imprimir o nueva venta.

## 9. Fases

### Fase 1 — Sistema visual + login

- Definir tokens.
- Ampliar `packages/ui` con componentes presentacionales mínimos.
- Rediseñar `LoginForm`.
- Verificar TPV y backoffice login.

### Fase 2 — Backoffice shell + dashboard

- Rediseñar shell.
- Rediseñar dashboard.
- Unificar toolbar, tabs, paneles, tablas y badges.
- Verificar navegación de pestañas actuales sin cambiar estado ni lógica.

### Fase 3 — Backoffice vistas operativas

- Catálogo, familias, usuarios, tiendas, ventas, stock, compras y VeriFactu.
- Mantener los mismos handlers y llamadas.
- Reducir CSS duplicado cuando sea seguro.

### Fase 4 — TPV venta y caja

- Rediseñar venta, búsqueda, familias, producto, stock, carrito y caja.
- Mantener carrito, cobro, descuentos y caja obligatoria sin cambios de lógica.

### Fase 5 — TPV devoluciones, traspasos y pulido responsive

- Rediseñar devolución con ticket, sin ticket, traspasos y modales.
- Revisión responsive y accesibilidad básica.

## 10. Verificación

Por cada fase:

- `pnpm --filter @simpletpv/ui typecheck` si se toca `packages/ui`.
- `pnpm --filter @simpletpv/tpv typecheck` cuando se toque TPV.
- `pnpm --filter @simpletpv/backoffice typecheck` cuando se toque backoffice.
- Abrir localhost y revisar visualmente pantallas afectadas.
- Mantener E2E existentes como contrato cuando el cambio toque flujos cubiertos.

No se declarará una fase completa sin verificación local del flujo afectado.

## 11. Riesgos y Controles

- **Riesgo:** tocar lógica accidentalmente al mover JSX.
  **Control:** cambios pequeños, diffs revisados y sin modificaciones en `lib/*`
  salvo aprobación.
- **Riesgo:** romper tests por cambiar textos o test ids.
  **Control:** conservar `data-testid` existentes.
- **Riesgo:** CSS compartido afecte muchas pantallas.
  **Control:** introducir tokens/componentes primero y migrar por pantalla.
- **Riesgo:** estética Vercel demasiado genérica para TPV táctil.
  **Control:** mantener botones grandes en acciones críticas del TPV.

## 12. Decisiones Aprobadas

- Se hará por fases, no como rediseño masivo.
- Se prioriza hacerlo bien y sin "liarla".
- Se empieza por base visual y login, luego backoffice, luego TPV.
- No se toca lógica sin preguntar.
- No se introduce Vercel/Next.
- shadcn/ui completo queda fuera salvo aprobación posterior.
