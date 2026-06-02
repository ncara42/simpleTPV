# Diseño — TPV calcado a mockups con capa demo

| Campo       | Valor                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-06-02                                                                                                                                         |
| Estado      | Aprobado para plan de implementación                                                                                                               |
| Alcance     | UI del TPV (`apps/tpv`) + componentes compartidos (`packages/ui`). Sin backend.                                                                    |
| Referencias | Mockups de Venta/Devolución/Traspasos/Caja; spec `2026-05-30-vercel-style-ui-ux-redesign-design.md`; spec `2026-05-29-issue83-seed-demo-design.md` |

## 1. Objetivo

Llevar las cuatro pantallas del TPV (Venta, Devolución, Traspasos, Caja) a una
fidelidad **idéntica** a los mockups aprobados, lista para presentar. El
backoffice queda fuera de alcance (más adelante).

Es una entrega **de presentación/demo**: no estamos en producción. Para que cada
pantalla se vea calcada nada más abrir, se introduce una **capa de datos demo
hardcodeados** que alimenta la UI sin depender de que la API o la BD estén
levantadas/sembradas. La lógica de interacción real (añadir al carrito, steppers,
toggles, navegación) sigue viva sobre esos datos.

## 2. Decisiones (acordadas en brainstorming)

1. **Datos demo hardcodeados en cliente** (no seed de BD, no cambios de API).
   Modo presentación: la app se ve calcada sin infra levantada.
2. **Sidebar fijo expandido** (≈212px), sin rail colapsable ni hover/pin. Con
   bloque de usuario abajo (avatar "MR", "Marta Ruiz", "Centro · Dependiente").
3. **Cabecera superior (TopBar)** nueva: eyebrow "TIENDA CENTRO" + título de la
   vista a la izquierda; toggle `Backoffice/TPV` (TPV activo, **solo visual**) +
   botón "Salir" a la derecha. El logout deja de vivir en el sidebar.
4. **Sin tocar backend** ni contratos de dominio. Solo presentación y fuente de
   datos. Coherente con el spec Vercel-style: no se alteran lógica, permisos,
   endpoints, queries, stores, validaciones ni estados de dominio.

## 3. Arquitectura

```
packages/ui/src/components/Sidebar.tsx     → fijo expandido + bloque de usuario
packages/ui/src/components/TopBar.tsx       → NUEVO: eyebrow+título / toggle+Salir
packages/ui/src/styles/sidebar.css          → ajustes sidebar fijo + footer usuario
packages/ui/src/styles/topbar.css           → NUEVO: estilos de la cabecera
packages/ui/src/index.ts                     → exporta TopBar

apps/tpv/src/demo/demoData.ts                → NUEVO: datos demo (calcados a mockups)
apps/tpv/src/App.tsx                         → shell: Sidebar + TopBar + main; título por vista
apps/tpv/src/styles.css                      → shell con cabecera (header + main)

apps/tpv/src/SalePage.tsx                    → Venta calcada (caja, buscador, chips, grid)
apps/tpv/src/CashPanel.tsx                   → barra de caja con "Esperado en caja"
apps/tpv/src/CartPanel.tsx                   → "Ticket actual" (precio/ud, base+IVA, Cobrar)
apps/tpv/src/ReturnPanel.tsx / ReturnsView   → Devolución con estado vacío centrado
apps/tpv/src/TransferReceivePanel.tsx        → Traspasos como tabla (fecha/origen/líneas/estado)
apps/tpv/src/sale.css                        → estilos de las cuatro vistas
```

### Capa demo

`demo/demoData.ts` exporta los datos exactos de los mockups y las funciones de
`lib/*` (catalog, cash, transfers, sales) se hacen devolver esos datos en lugar de
llamar a la API. El carrito (store Zustand) se **precarga** con las 3 líneas del
ticket de la imagen. La interacción real sigue funcionando sobre los datos demo.

## 4. Detalle por pantalla

### 4.1 Sidebar (compartido)

- Siempre expandido (212px). Se elimina la lógica `pinned`/`hovered`/`expanded`.
- Header: logo cuadrado teal con "S" + "SimpleTPV" / "Punto de venta".
- Nav: Venta, Devolución, Traspasos, Caja (icono lucide + label; activo verde suave).
- Footer: avatar circular "MR" + "Marta Ruiz" / "Centro · Dependiente". Sin logout.
- Comportamiento móvil (overlay) se conserva por robustez.

### 4.2 TopBar (compartido, nuevo)

- Fondo blanco, borde inferior fino, altura de cabecera.
- Izquierda: eyebrow "TIENDA CENTRO" (mayúsculas, gris, tracking) + h1 con el
  título de la vista (`Venta`, `Devolución`, `Recepción de traspasos`, `Caja`).
- Derecha: toggle segmentado `Backoffice | TPV` (TPV activo, visual; sin
  navegación) + botón con borde "⎋ Salir" (icono `LogOut`) → logout real.

### 4.3 Venta

- **Barra de caja**: punto verde + "Caja abierta" · "Apertura 150,00 €" ·
  "Esperado en caja 462,40 €" · botón "Cerrar caja" (derecha). Se añade el dato
  "Esperado en caja".
- **Buscador**: lupa + "Buscar producto por nombre o SKU…" + botón "Escanear F3".
- **Chips de familia**: "Todas 88" (activo) + Flores CBD 42, Aceites 12,
  Cosmética 18, Vapeo 9, Infusiones 7 (punto de color + contador).
- **Grid**: tarjetas (nombre arriba; precio grande + badge de stock abajo). Stock
  por nivel (verde/ámbar/rojo) o badge rojo "Agotado" (Vapeador Pro). 3 columnas.
- **Ticket actual** (panel derecho, reescritura de CartPanel):
  - Cabecera "Ticket actual" + enlace "Vaciar".
  - Líneas: nombre + precio unitario debajo ("24,90 € / ud") + stepper `− qty +` +
    total a la derecha. Precargado: Aceite CBD 10% ×1, Flor Lemon Haze 2g ×2,
    Crema regeneradora 50ml ×1.
  - Pie: "Base imponible 60,99 €", "IVA (21%) 12,81 €", "Total 73,80 €" grande,
    botón negro "Cobrar · 73,80 €". El botón "Aplicar descuento" se oculta de la
    vista por defecto (lógica intacta).

Datos demo de producto (nombre · precio · stock/estado):
Aceite CBD 10% · 24,90 · 18 (green) | Flor Lemon Haze 2g · 14,50 · 3 (yellow) |
Crema regeneradora 50ml · 19,90 · 11 (green) | Vapeador Pro · 39,00 · Agotado |
Resina Premium 1g · 22,00 · 25 (green) | Infusión relax 20u · 8,90 · 4 (yellow) |
Aceite CBD 5% · 16,90 · 30 (green) | Flor Premium 3,5g · 29,90 · 12 (green) |
Bálsamo muscular · 12,50 · 9 (green) | Líquido vape 10ml · 9,90 · 2 (yellow) |
Infusión noche 15u · 7,50 · 16 (green) | Aceite full spectrum · 34,00 · 6 (yellow).

### 4.4 Devolución

- Título "Devolución" + subtítulo "Reintegro con o sin ticket".
- Toggle "Con ticket | Sin ticket" (negro activo).
- Buscador "Nº de ticket, fecha o producto…".
- Estado vacío centrado: tarjeta blanca, icono circular tenue, "Busca el ticket
  original" + "Escanea el QR del ticket o introduce su número para empezar la
  devolución."

### 4.5 Traspasos (tabla)

- Título "Recepción de traspasos" + subtítulo "Mercancía enviada desde central".
- Tabla: FECHA / ORIGEN / LÍNEAS / ESTADO + acción.
- Filas demo: `31/05 08:30 · Central · 7 · [Pendiente]` con "Recibir";
  `29/05 16:10 · Central · 4 · [● Recibido]` sin acción.
- Badges: "Pendiente" (neutro), "Recibido" (verde con punto). "Recibir" abre el
  detalle de recepción existente.

### 4.6 Caja

- Título "Sesión de caja" + subtítulo "Tienda Centro · turno de mañana".
- Tarjeta centrada: cabecera "Estado" + badge verde "● Abierta".
- Filas: "Apertura 150,00 €", "Ventas efectivo + 312,40 €", "Esperado en caja
  462,40 €".
- Botón rojo ancho "Cerrar caja" (abre el flujo de cierre existente).

## 5. Errores y testing

- Los flujos reales (cobro, cierre de caja, recepción) conservan su manejo de
  errores. La capa demo no introduce errores nuevos.
- Se mantienen los `data-testid` usados por los e2e. Tras el rediseño se ejecuta
  `pnpm --filter @simpletpv/tpv test:e2e` y se ajustan los selectores que cambien
  (p.ej. "Carrito" → "Ticket actual", lista de traspasos → tabla), como en los
  commits recientes de adaptación e2e.

## 6. Fuera de alcance

- Backoffice (más adelante).
- Cambios de backend, esquema Prisma, endpoints o seed de BD.
- Funcionalidad nueva de dominio (el toggle Backoffice/TPV es solo visual).
