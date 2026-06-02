# Diseño — Backoffice calcado a mockups con capa demo

| Campo       | Valor                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-06-02                                                                                                                              |
| Estado      | Aprobado para plan de implementación                                                                                                    |
| Alcance     | UI del backoffice (`apps/backoffice`) + `TopBar` compartida; toggle navegable en ambas apps. Sin backend.                               |
| Referencias | Mockups de Dashboard/Catálogo/Familias/Stock/Usuarios/Tiendas/Ventas/Compras/VeriFactu; spec `2026-06-02-tpv-mockup-fidelity-design.md` |

## 1. Objetivo

Llevar las nueve pantallas del backoffice (Dashboard, Catálogo, Familias, Stock,
Usuarios, Tiendas, Ventas, Compras, VeriFactu) a una fidelidad **idéntica** a los
mockups aprobados, lista para presentar, reutilizando el sistema visual y la
estrategia de capa demo que ya aplicamos en el TPV.

Entrega **de presentación/demo**: una capa de datos demo hardcodeados alimenta la
UI sin depender de API/BD. La lógica de las páginas no se reescribe; cambia la
**fuente de datos** y se refina la **presentación** donde haga falta para calcar.

## 2. Decisiones (acordadas en brainstorming)

1. **Demo total hardcodeado** (como el TPV): interceptar las funciones de
   `apps/backoffice/src/lib/*` (admin, dashboard, families, products, purchases,
   stock, verifactu) para devolver datos demo; `api.login` mockeado que acepta
   cualquier credencial y guarda un JWT falso con `role: 'ADMIN'` (para pasar el
   guard del backoffice). Sin tocar backend.
2. **TopBar compartida con toggle navegable.** Se sustituye la `bo-topbar`
   artesanal por la `TopBar` de `packages/ui` (`activeApp="backoffice"`,
   `eyebrow="Administración"`). El toggle Backoffice/TPV **navega de verdad**
   entre apps por URL leída de variables de entorno Vite.
3. **Toggle por env vars.** El backoffice navega al TPV con `VITE_TPV_URL`
   (default `http://localhost:5173`); el TPV navega al backoffice con
   `VITE_BACKOFFICE_URL` (default `http://localhost:5174`). Esto implica cablear
   también el toggle del TPV (hoy visual).
4. **Sin tocar lógica de dominio** ni estructura de componentes de las páginas.

## 3. Arquitectura

```
packages/ui/src/components/TopBar.tsx        → onSwitchApp navega por URL (extensión)

apps/backoffice/src/demo/demoData.ts         → NUEVO: datos demo de las 9 vistas
apps/backoffice/src/App.tsx                  → shell con TopBar compartida + toggle navegable
apps/backoffice/src/styles.css               → quita .bo-topbar artesanal (la sustituye TopBar)

apps/backoffice/src/lib/{admin,dashboard,families,products,purchases,stock,verifactu}.ts
                                             → devuelven datos demo
apps/backoffice/src/lib/auth.ts              → login mockeado (JWT role=ADMIN)

apps/backoffice/src/StoresPage.tsx           → reescrita a grid de cards (no tabla)
apps/backoffice/src/DashboardPage.tsx        → calcada al mockup (KPIs, barras, listas)
apps/backoffice/src/*.tsx (resto)            → ajustes de presentación calcados
apps/backoffice/src/catalog.css/dashboard.css → ajustes de estética (cards Tiendas, etc.)

apps/tpv/src/App.tsx                         → toggle TopBar navega a VITE_BACKOFFICE_URL
```

### Capa demo

`demo/demoData.ts` expone los datos exactos de los mockups. Las funciones de
`lib/*` los devuelven vía `Promise.resolve` en vez de llamar a `api`. `api.login`
se mockea. No se toca `packages/auth`.

### Toggle navegable

`TopBar` recibe `onSwitchApp(app)`. En cada app, el handler hace
`window.location.assign(targetUrl)` donde `targetUrl` sale de
`import.meta.env.VITE_TPV_URL` / `VITE_BACKOFFICE_URL` con defaults de local.
Pulsar el segmento de la app activa no hace nada.

## 4. Detalle por pantalla

### 4.1 Shell

- `Sidebar` existente (fijo expandido), `brand={{ title: 'SimpleTPV', subtitle:
'Backoffice' }}`, `user={{ name: 'Ana Caravaca', subtitle: 'Central · Admin' }}`.
  Grupos: TIENDA (Catálogo, Familias, Stock), GESTIÓN (Usuarios, Tiendas), VENTAS
  (Ventas, Compras, VeriFactu); Dashboard sin grupo.
- `TopBar` compartida: eyebrow "ADMINISTRACIÓN" + título de la vista; toggle
  Backoffice·TPV (Backoffice activo, navegable) + Salir.

### 4.2 Dashboard

- Cabecera "Resumen de hoy / Última actualización hace 2 min" + segmentos
  Hoy/Ayer/Semana/Mes + selector "Todas las tiendas".
- 6 KPIs: Facturación hoy 1.284 € (▲+12,4%), Ticket medio 18,90 € (▲+3,1%), UPT
  2,4 (▼-0,8%), % Margen 41% (▲+1,2%), Tasa dto. 6,2% (▼+0,5%), Devoluciones 1,8%
  (▲-0,3%).
- Ventas hoy vs ayer (barras por tienda, Ayer gris/Hoy verde).
- Roturas de stock (Aceite CBD 10% Centro·0 ud, Vapeador Pro Centro·0 ud, Flor
  Lemon Haze Norte·3 ud, Infusión relax Sur·4 ud) + "Venta perdida est. 320 €".
- Ventas por familia (Flores CBD 488 €, Aceites 344 €, …) y Top productos
  (ranking por facturación, Aceite CBD 10% 142 €…).

### 4.3 Catálogo

- "12 productos activos" + buscador + "Nuevo producto".
- Tabla NOMBRE/SKU/PRECIO/IVA/STOCK (badge color)/Editar·Borrar. Stock 0 → badge
  rojo. Productos demo idénticos al catálogo del TPV (con IVA 21%/10%).

### 4.4 Familias

- "Estructura de catálogo · 2 niveles" + "Nueva familia".
- Filas con bullet de color + nombre + "N productos" + Editar·Borrar: Flores CBD
  24, Aceites 12, Cosmética 18, Vapeo 9, Infusiones 7.

### 4.5 Stock

- "Stock por tienda en tiempo real" + subtabs Stock global | Alertas `2` | Traspasos.
- Stock global: tabla PRODUCTO / POR TIENDA (badges `Centro : 0`, `Norte : 18`…
  con punto de nivel) / TOTAL / Movimientos. Filas: Aceite CBD 10% (0/18/24=42),
  Flor Lemon Haze (8/3/8=19), Vapeador Pro (0/4/3=7), Crema regeneradora
  (11/14/8=33), Infusión relax (6/2/4=12).

### 4.6 Usuarios

- "4 usuarios" + "Nuevo usuario". Tabla NOMBRE/EMAIL/ROL (badge)/TIENDA/Editar:
  Ana Caravaca (admin@org1.test, Admin, Central), Luis Pérez (luis@org1.test,
  Responsable, Centro), Marta Ruiz (marta@org1.test, Dependiente, Norte), Jon
  Aguirre (jon@org1.test, Dependiente, Sur).

### 4.7 Tiendas (cards)

- "6 ubicaciones" + "Nueva tienda". Grid de cards (icono tienda + nombre +
  dirección + badge): Centro (C/ Mayor 12, Activa), Norte (Av. Norte 88, Activa),
  Sur (Pza. Sur 3, Activa), Gran Vía (Gran Vía 41, Activa), Online (eCommerce,
  Activa), Almacén (Pol. Ind. 7, badge "Almacén"). Reescribe el layout actual
  (tabla → cards) conservando crear/borrar.

### 4.8 Ventas

- "Historial de tickets · hoy" + "Todas las tiendas". Tabla
  TICKET/TIENDA/LÍNEAS/PAGO/TOTAL/HORA: #A-1042 Centro 3 Efectivo 53,90 € 12:41,
  #A-1041 Centro 1 Tarjeta 24,90 € 12:30, #A-1040 Norte 5 Tarjeta 88,40 € 12:18
  (anulada, tachada + badge "Anulada"), #A-1039 Sur 2 Efectivo 34,40 € 11:57,
  #A-1038 Gran Vía 4 Tarjeta 61,20 € 11:40.

### 4.9 Compras (estado vacío)

- "Propuestas y pedidos a proveedor". Estado vacío centrado: icono + "Sin pedidos
  abiertos" + "Genera una propuesta automática a partir de ventas, rotación y
  mínimos." + botón "＋ Generar propuesta". Demo devuelve 0 pedidos abiertos.

### 4.10 VeriFactu

- "Cumplimiento y cola de envíos a AEAT". 3 cards: Registros enviados hoy 128 (▲
  al día), En cola 0 (sin pendientes), Fallidos 0. Card "Estado del conector ·
  Proveedor homologado · sandbox AEAT · ● Operativo · Último envío hace 14 s".

## 5. Modo demo, login y testing

- **Demo siempre activo**: el backoffice no llama a la API; `lib/*` devuelve datos
  demo y `api.login` se mockea (JWT `role: 'ADMIN'`). No se toca `packages/auth`.
- **Login conservado** (mockeado): cualquier credencial entra; el guard de rol
  ADMIN pasa por el JWT falso.
- **Testing**: los e2e actuales (`access.spec.ts`, `dashboard.spec.ts`) dependen
  de API/login real → se reescriben para modo demo (login con cualquier
  credencial, dashboard con KPIs demo, navegación entre vistas). Se conservan los
  `data-testid` que sigan teniendo sentido. Verificación: `pnpm --filter
@simpletpv/backoffice test:e2e` (o build + Playwright), typecheck y lint del
  workspace, y verificación visual de las 9 vistas contra los mockups.

## 6. Fuera de alcance

- Cambios de backend, esquema Prisma, endpoints o seed de BD.
- Rediseño funcional (nuevas features). El toggle navega pero no cambia lógica.
- Modo demo del TPV ya entregado; aquí solo se cablea su toggle a la env var.
