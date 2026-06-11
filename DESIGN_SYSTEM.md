# Sistema de diseño — qrush retail / simpleTPV

> **Estado:** congelado a partir de la interfaz actual (extraído 1:1 de las fuentes de estilo del repo).
> **Propósito:** definir de forma exacta y exhaustiva el aspecto y el comportamiento que tiene HOY nuestra
> interfaz, para no desviarnos del estilo original. Cualquier pantalla nueva debe poder describirse con
> estos tokens y patrones; si algo no encaja, primero se discute el token, no se inventa un valor suelto.
>
> **Nota sobre `DESIGN.md`:** ese archivo es la _referencia estética externa_ (análisis de Apple.com) que
> inspiró el lenguaje. **Este** documento (`DESIGN_SYSTEM.md`) es el sistema real, implementado y vigente.

---

## 0. Cómo leer y usar este documento

- **Fuentes de verdad (no hardcodear hex):**
  - Capa base de tokens: `packages/ui/src/styles/theme.css`
  - Remap de marca por app ("Fundación Apple"): `apps/backoffice/src/styles.css` y `apps/tpv/src/styles.css` (idénticos)
  - Componentes compartidos + sus CSS: `packages/ui/src/components/*` y `packages/ui/src/styles/*`
  - Patrones de página: `apps/backoffice/src/{dashboard,catalog}.css`, `apps/tpv/src/sale.css`
- **Regla de oro:** usar siempre variables `--ui-*` (o utilidades Tailwind `rounded-*`, que apuntan a los mismos tokens). Nunca un color/medida literal en componentes.
- **Idioma de la UI:** español de España (tuteo peninsular).

---

## 1. Principios (de `PRODUCT.md`)

1. **La velocidad es una feature de diseño.** Todo lo que añade tiempo cognitivo (animación lenta, jerarquía ambigua, microcopy innecesario) es un bug.
2. **Densidad con claridad.** Más información visible sin sacrificar legibilidad. Dependientes = foco; encargados = contexto.
3. **Consistencia por encima de creatividad.** Un patrón predecible > uno sorprendente. La personalidad vive en el detalle.
4. **El error es parte del flujo.** Estados de error, vacío y carga merecen el mismo cuidado que el estado feliz.
5. **Profesional ≠ aburrido.** Craft y micro-detalles intencionales sin estorbar el trabajo.

**Personalidad:** Preciso · Rápido · Profesional. _"Software que desaparece cuando funciona bien."_

**Anti-referencias (qué NO parecer):** ERPs grises (SAP/Sage), SaaS genérico de gradientes morados, POS infantil de colores primarios, banca hierática.

---

## 2. Arquitectura de tokens (3 capas)

La UE viva resulta de aplicar tres capas en orden:

```
Capa 1 — BASE neutra (packages/ui/src/styles/theme.css)
         Paleta neutra cálida + marca TEAL + primario tinta negra.
         Es el contrato de nombres (--ui-*) y el fallback.
                    │  (cada app la importa y luego la sobre-escribe)
                    ▼
Capa 2 — FUNDACIÓN APPLE (apps/*/src/styles.css)  ←★ ESTE ES EL ASPECTO VIVO
         Remapea TODOS los --ui-* a la paleta Apple: Action Blue #0066cc,
         lienzo parchment #f5f5f7, tinta #1d1d1f, hairlines, SF Pro,
         radios 8/12/18/pill, cero sombras de chrome. backoffice ≡ tpv.
                    │
                    ▼
Capa 3 — TAILWIND @theme inline (apps/tpv/src/styles.css)
         Mapea radius-xs..xl de Tailwind a los tokens --ui-radius-*
         → `rounded-lg` y `var(--ui-radius-lg)` rinden idéntico.
```

> **Conclusión operativa:** el aspecto real de ambas apps es la **Fundación Apple** (capa 2). La capa base
> (teal/neutro) solo se vería si una app dejara de remapear. Las tablas de abajo dan **ambos** valores:
> el `BASE` (contrato) y el `VIVO (Apple)` (lo que se ve).

---

## 3. Color

### 3.1 Superficies y bordes

| Token                     | BASE (theme.css) | VIVO (Apple)                 | Uso                                                          |
| ------------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `--ui-bg`                 | `#f6f6f4`        | `#f5f5f7` (canvas/parchment) | Lienzo de la app                                             |
| `--ui-surface`            | `#ffffff`        | `#ffffff`                    | Cards, paneles, menús, inputs                                |
| `--ui-surface-subtle`     | `#f4f4f2`        | `#f5f5f7`                    | Zebra, hover de fila, fondos de tab/track                    |
| `--ui-border`             | `#e6e5e0`        | `#e3e3e6` (hairline)         | Hairline suave (la elevación por defecto)                    |
| `--ui-border-strong`      | `#d8d6cf`        | `#d2d2d7`                    | Hairline marcado, líneas base de gráficas, bordes de control |
| `--ap-pearl` (solo Apple) | —                | `#fafafc`                    | Superficie sutil                                             |

### 3.2 Texto

| Token             | BASE      | VIVO (Apple)       | Uso                                      |
| ----------------- | --------- | ------------------ | ---------------------------------------- |
| `--ui-text`       | `#18181a` | `#1d1d1f` (ink)    | Titulares y cuerpo                       |
| `--ui-text-muted` | `#6b6b66` | `#6e6e73` (gray-1) | Texto secundario                         |
| `--ui-text-soft`  | `#8d897f` | `#86868b` (gray-2) | Texto terciario, placeholders, etiquetas |

### 3.3 Acción primaria y marca

| Token                | BASE              | VIVO (Apple)            | Uso                                                            |
| -------------------- | ----------------- | ----------------------- | -------------------------------------------------------------- |
| `--ui-primary`       | `#171717` (tinta) | `#0066cc` (Action Blue) | Botón primario, enlaces, foco                                  |
| `--ui-primary-hover` | `#000000`         | `#0071e3`               | Hover del primario                                             |
| `--ui-primary-fg`    | `#ffffff`         | `#ffffff`               | Texto sobre primario                                           |
| `--ui-brand`         | `#0e7c6b` (teal)  | `#0066cc`               | **Único acento de data-viz**: barras, dots, medidores, activos |
| `--ui-brand-ink`     | `#0a5447`         | `#0066cc`               | Texto/iconos de acento (check de Select, posición #1)          |
| `--ui-brand-soft`    | `#0e7c6b14`       | `rgba(0,102,204,.08)`   | Relleno suave de acento (opción activa, área de sparkline)     |
| `--ui-brand-soft-2`  | `#0e7c6b22`       | `rgba(0,102,204,.14)`   | Acento un punto más sólido (chip de podio)                     |

> **En Apple, marca = primario = Action Blue.** No hay dos acentos. El color es escaso por diseño.

### 3.4 Semántica

| Rol     | Token ink / soft — BASE | Token ink / soft — VIVO (Apple) |
| ------- | ----------------------- | ------------------------------- |
| Peligro | `#c0392b` / `#fbeae7`   | `#d70015` / `#ffe5e7`           |
| Aviso   | `#b45309` / `#fdf4e6`   | `#b25000` / `#fff1e3`           |
| Éxito   | `#16734f` / `#e8f3ec`   | `#1d7d4f` / `#e3f4ea`           |

Patrón de uso: **`-soft` como fondo + `ink` como texto/icono** (píldoras de estado, badges de severidad, toasts).

### 3.5 Sidebar (tokens dedicados)

| Token                                               | BASE                | VIVO (Apple)         |
| --------------------------------------------------- | ------------------- | -------------------- |
| `--sidebar-bg`                                      | `#ffffff`           | `#ffffff` (surface)  |
| `--sidebar-item-active-bg`                          | `rgb(0 0 0 / .07)`  | `rgba(0,0,0,.065)`   |
| `--sidebar-item-hover-bg`                           | `rgb(0 0 0 / .042)` | `rgba(0,0,0,.038)`   |
| `--sidebar-text`                                    | `#6b6b66`           | `gray-1`             |
| `--sidebar-text-active`                             | `= --ui-text`       | `ink`                |
| `--sidebar-group-label-color`                       | `#8d897f`           | `gray-1` (AA a 11px) |
| `--sidebar-width-rail` / `--sidebar-width-expanded` | `56px` / `232px`    | igual                |

**Selección "silenciosa" estilo ChatGPT:** el ítem activo NO usa color; usa relleno neutro + tinta plena. El único color del sidebar vive en el logotipo y el anillo de foco.

---

## 4. Tipografía

### 4.1 Familias

- **VIVO (apps):** `'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif` con `-webkit-font-smoothing: antialiased` + `text-rendering: optimizeLegibility`.
- **BASE (theme.css):** `Geist, Inter, ui-sans-serif, system-ui, -apple-system, …`
- **Monoespaciada (impresión / ESC-POS, tickets):** `ui-monospace, monospace` / `'Courier New'`.
- **Numéricos:** `font-variant-numeric: tabular-nums` global en el `body` → las cifras no bailan de ancho.

### 4.2 Escala (tokens `--ui-text-*`, raíz 16px)

| Token            | rem    | px  | Uso canónico                                      |
| ---------------- | ------ | --- | ------------------------------------------------- |
| `--ui-text-2xs`  | 0.6875 | 11  | kbd, micro-etiquetas, labels de grupo del sidebar |
| `--ui-text-xs`   | 0.75   | 12  | etiquetas, badges, metadatos                      |
| `--ui-text-sm`   | 0.8125 | 13  | texto secundario, cuerpo de toast                 |
| `--ui-text-base` | 0.875  | 14  | **cuerpo / controles**                            |
| `--ui-text-md`   | 0.9375 | 15  | cuerpo enfatizado, título de marca sidebar        |
| `--ui-text-lg`   | 1.0625 | 17  | títulos de sección                                |
| `--ui-text-xl`   | 1.25   | 20  | cifras destacadas                                 |
| `--ui-text-2xl`  | 1.5    | 24  | título de página                                  |
| `--ui-text-3xl`  | 1.75   | 28  | total del carrito (TPV)                           |
| `--ui-text-4xl`  | 2      | 32  | total del modal de cobro (TPV)                    |

### 4.3 Pesos y tracking (convención observada)

- **Pesos usados:** 500 (controles/cuerpo enfatizado), 600 (titulares, valores, activos), 700 (totales grandes, logo, badges numéricos), 800 (marca del icono de toast). El 400 es el cuerpo base.
- **Tracking (`letter-spacing`) negativo escalado al tamaño:** cuerpo/controles `-0.012em`; titulares de panel `-0.016em`; título de topbar `-0.02em`; valores KPI `-0.025em`; totales grandes `-0.03em`.
- **Mayúsculas + tracking positivo** para micro-etiquetas: cabeceras de tabla y labels (`text-transform: uppercase` con `letter-spacing` 0.045–0.1em a 0.7–0.72rem).

---

## 5. Forma y espaciado

Escala única por rol (`--ui-radius-*`). En la **Fundación Apple** se sobre-escriben tres a 8/12/18:

| Token              | BASE  | VIVO (Apple) | Rol                                                         |
| ------------------ | ----- | ------------ | ----------------------------------------------------------- |
| `--ui-radius-xs`   | 6px   | 6px          | insignias, kbd, micro-controles, cabeceras de grupo sidebar |
| `--ui-radius-sm`   | 8px   | 8px          | botones, chips, inputs, steppers, tabs, ítems de sidebar    |
| `--ui-radius-md`   | 10px  | 10px         | filas de lista, ítems internos (`--ui-radius` = md)         |
| `--ui-radius-lg`   | 12px  | **18px**     | tarjetas, paneles, barras de búsqueda, tablas               |
| `--ui-radius-xl`   | 16px  | 16px         | modales y superficies grandes (KPI cards)                   |
| `--ui-radius-pill` | 999px | 999px        | píldoras de estado, dots, selección activa                  |

**Regla "pill" de Apple (importante, difiere entre apps):**

- **Backoffice:** dentro de `.app-shell`, **TODOS los `<button>`** y los `.ui-select-trigger` van a cápsula (`border-radius: 9999px`). Las filas de sidebar quedan en rect redondeado salvo la activa/hover (cápsula).
- **TPV:** la cápsula se aplica **selectivamente** (lista explícita: `.btn-primary`, `.cart-*`, `.pay-*`, `.cash-*`, `.scan-btn`, `.tpv-tab`, inputs de búsqueda…) porque es un POS: la **cuadrícula de producto** (`.prod-card` es un `<button>`) y los **steppers +/-** conservan su radio propio; los `<textarea>` quedan fuera.

**Altura de control estándar del backoffice:** `--bo-control-height: calc(30px + 0.36rem + 2px)` (≈ 39.76px). Iguala la altura exterior de las pills de periodo/tab para que toda cabecera de control alinee.

### 5.1 Espaciado (tokens `--ui-space-*`)

Escala base **0.25rem (4px)**. Es la **paleta de espaciados** de la UI: usar SIEMPRE estos tokens para `padding`, `margin` y `gap`. **No hardcodear medidas**; si falta un paso, añadirlo a `theme.css`, no al componente.

| Token           | Valor   | px  | Uso                                   |
| --------------- | ------- | --- | ------------------------------------- |
| `--ui-space-1`  | 0.25rem | 4   | micro: gaps de iconos, chips          |
| `--ui-space-2`  | 0.5rem  | 8   | gaps de controles, padding de badge   |
| `--ui-space-3`  | 0.75rem | 12  | gaps de formulario, padding compacto  |
| `--ui-space-4`  | 1rem    | 16  | **padding estándar de panel / celda** |
| `--ui-space-5`  | 1.25rem | 20  | padding cómodo de tarjeta             |
| `--ui-space-6`  | 1.5rem  | 24  | separación entre secciones            |
| `--ui-space-7`  | 1.75rem | 28  | padding de modal                      |
| `--ui-space-8`  | 2rem    | 32  | padding amplio / superficies grandes  |
| `--ui-space-10` | 2.5rem  | 40  | separaciones de página                |

Convención: el **padding interior de un panel de contenido** es `--ui-space-4` (cómodo `--ui-space-5`); el **gap entre secciones de formulario**, `--ui-space-6`; el **padding de badge/píldora**, `--ui-space-1`/`--ui-space-2`.

---

## 6. Elevación, sombras y hairlines

> **Filosofía Apple: la elevación es el hairline, no la sombra.** En la capa viva, `--ui-shadow-sm` y `--ui-shadow-panel` son `none`. La profundidad real se reserva para overlays (menús, modales, toasts, drawers).

| Token               | Valor (BASE)                                           | Uso                       |
| ------------------- | ------------------------------------------------------ | ------------------------- |
| `--ui-shadow-sm`    | `0 1px 2px rgb(0 0 0 / .045)` — **`none` en Apple**    | Elevación mínima de panel |
| `--ui-shadow-md`    | `0 4px 16px -6px rgb(0 0 0 / .12)`                     | Toasts                    |
| `--ui-shadow-lg`    | `0 12px 32px -12px rgb(0 0 0 / .22)`                   | (reservado)               |
| `--ui-shadow-panel` | `0 1px 3px /.06, 0 1px 2px /.04` — **`none` en Apple** | Paneles                   |

Sombras concretas de overlays (no tokenizadas, valores literales canónicos):

- **Menú flotante (Select / cuenta):** `0 0 0 0.5px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.14)`
- **Modal:** `0 24px 70px -16px rgba(0,0,0,.4)`
- **Drawer:** `-24px 0 70px -24px rgba(0,0,0,.45)`
- **Backdrops:** modal `rgba(10,20,19,.5)`, drawer `rgba(10,20,19,.45)`, overlay móvil sidebar `rgba(0,0,0,.32)`.

---

## 7. Foco y accesibilidad

- **Anillo de foco** (`--ui-focus`): BASE `0 0 0 3px var(--ui-brand-soft-2)`; **VIVO (Apple)** `0 0 0 4px rgba(0,113,227,.32)`. Se aplica con `:focus-visible` (no `:focus`) en sidebar, select, cuenta, etc.
- **Objetivo WCAG AA** mínimo; contraste de cuerpo ≥ 4.5:1. Las etiquetas de grupo del sidebar usan `gray-1` (no `gray-2`) precisamente para cumplir AA a 11px.
- **`prefers-reduced-motion: reduce` se respeta siempre:** se anulan animaciones de toast, barras, sparklines, micro-gestos del sidebar y transforms de `:active`.
- **`tabular-nums`** global para que las métricas no salten.
- **Semántica ARIA** en componentes: toasts con `role="status"` (avisos) o `role="alert"` (errores); selects con `aria-expanded`; iconos decorativos con `aria-hidden`.

---

## 8. Movimiento (motion)

Una sola gramática de tiempos y curva para toda la UI:

| Token                | Valor                        | Uso                            |
| -------------------- | ---------------------------- | ------------------------------ |
| `--ui-ease`          | `cubic-bezier(0.2, 0, 0, 1)` | **Curva única** de toda la UI  |
| `--ui-motion-fast`   | `0.12s`                      | hover/estado de controles      |
| `--ui-motion-medium` | `0.18s`                      | transiciones de superficie     |
| `--ui-motion-slow`   | `0.24s`                      | entradas de modal/banner/toast |

**Gestos canónicos (keyframes existentes):**

- `ui-alert-in` (toast: fade + subida 0.5rem, 0.24s)
- `ui-select-pop` / `sidebar-account-pop` (menús: fade + 4px, 0.12s)
- `dash-bar-rise` (barras: `scaleY(0→1)`, 0.55s `cubic-bezier(.22,1,.36,1)`, **stagger** `--i * 70ms`)
- `dash-family-grow` (barras horizontales y medidores: `scaleX`, mismo timing/stagger)
- `drawer-slide-in` (drawer desde la derecha, 0.28s)
- **Micro-interacción de iconos del sidebar:** al hover, el icono ejecuta **una vez** una de tres animaciones (`sidebar-icon-hop` / `-wiggle` / `-pulse`) elegida por hash del id → no todos hacen el mismo gesto.
- **Press feedback:** botones `active:translate-y-px` (Button base) o `active: scale(0.96)` / `scale(.985)` (botones de página/sidebar).

---

## 9. Layout y estructura

- **Shell:** `.app-shell` flex, `min-height: 100vh`. `.sidebar` es `position: fixed` (ancho 232px expandido / 56px rail); el contenido (`.app-content`) lleva `margin-left` igual al ancho actual del sidebar.
- **Topbar:** 64px, `position: sticky; top:0; z-index:20`, fondo translúcido `rgba(255,255,255,.8)` con `backdrop-filter: saturate(180%) blur(20px)`, hairline inferior. Z-index: topbar 20 < sidebar 30 < drawer/menus 60 ; **modal backdrop 50** (cubre toda la app).
- **Main:** padding `2rem 2.5rem 3.5rem` (escritorio) → `1.25rem 1.1rem 2.5rem` (≤767px).
- **Rejilla del dashboard:**
  - Banda de KPIs: `grid` de **6 columnas**, gap `0.85rem` → **3** (≤1100px) → **2** (≤640px).
  - Paneles: rejilla editorial de **12 columnas**, gap `1rem`; paneles `span-7`/`span-5` que colapsan a 12 (≤1000px).
- **Breakpoints canónicos:** `767px` (móvil shell), `1000px`, `1100px`, `640px`, `900px`.

---

## 10. Componentes (especificación exacta)

### 10.1 Button (`packages/ui/src/components/Button.tsx`)

- **Base:** `inline-flex`, `gap-2`, `rounded-[var(--ui-radius-sm)]`, `border`, `text-sm font-medium`, `transition`, `active:translate-y-px`, `disabled:opacity-50 disabled:cursor-not-allowed`.
- **Tamaños:** `sm` = `h-8 px-3 text-xs` · `md` (def.) = `h-9 px-4` · `lg` = `h-11 px-5 text-base`.
- **Variantes:** `primary`/`default` (bg `--ui-primary`, fg `--ui-primary-fg`, hover `--ui-primary-hover`) · `secondary` (surface + `--ui-border`, hover surface-subtle) · `ghost` (transparente, texto muted→text) · `danger` (bg `--ui-danger`, texto blanco).
- **Acción primaria de página** (`.btn-primary`, CSS): altura `--bo-control-height`, `padding 0 1.25rem`, **pill**, `0.9rem/500/-0.012em`, bg `--ui-primary`, hover `--ui-primary-hover`, `active: scale(0.96)`.
- **Botón secundario/enlace** (`.link-btn`): `h:2rem`, pill, borde `--ui-border-strong`, bg surface, texto `--ui-primary`, `0.85rem`.

### 10.2 Input (`Input.tsx`)

`h-9 w-full rounded-[var(--ui-radius-sm)]`, borde `--ui-border`, bg surface, `px-3 text-sm`, placeholder `--ui-text-soft`, **focus**: `border-neutral-400` + `box-shadow var(--ui-focus)`, disabled `opacity-50`. (En las apps, los inputs suelen ir a pill por el override de la Fundación Apple.)

### 10.3 Select propio (`Select.tsx` + `select.css`) — no nativo

- **Trigger** (`.ui-select-trigger`): pill (en app), `h:2.5rem`, `padding 0 .9rem`, borde `--ui-border-strong`, `0.86rem/500/-0.012em`; hover surface-subtle; **focus / `aria-expanded`**: borde primario + `--ui-focus`. Chevron rota 180° al abrir. Contador opcional tabular.
- **Menú** (`.ui-select-menu`): radio 14px, padding `.35rem`, sombra de menú flotante, `pop 0.12s`, `max-height: 18rem` scrollable, abre a `top: calc(100% + 6px)`.
- **Opción** (`.ui-select-option`): radio 8px, `0.86rem`; **activa** (hover/teclado) bg `--ui-brand-soft` + texto `--ui-brand-ink`; **seleccionada** `font-weight:600` + check `--ui-brand-ink`; cuando hay selección, las **no seleccionadas se atenúan a `opacity:.45`** (se restauran al hover).

### 10.4 Badge (`Badge.tsx`)

`rounded-full border px-2 py-0.5 text-xs font-medium`. Variantes: `default` (border `--ui-border` + bg surface-subtle), `success`/`warning`/`danger` (pares Tailwind `*-200/*-50/*-700`), `muted` (sin borde, texto muted). Las **píldoras de estado de página** (`.role-badge`, `.dash-stockout-tag`, etc.) siguen el patrón `-soft` de fondo + `ink` de texto, `0.78rem/600`.

### 10.5 Alert / Toast (`Alert.tsx` + `alert.css`)

Toast **fijo abajo-derecha** (`bottom/right: 1.5rem`, `z:60`), `max-width: 22rem`, borde 1px del acento, radio `lg`, fondo `*-soft` del acento, sombra `--ui-shadow-md`, entrada `ui-alert-in 0.24s`. Icono en **círculo** de 1.5rem (bg acento, glifo blanco 800: `✓`/`!`). Cuerpo `0.8125rem`; `<strong>` en color de acento, `<span>` muted. Auto-cierre opcional por `duration` (llama a `onClose`). Variantes `success`/`danger`/`warning`.

### 10.6 EmptyState (`EmptyState.tsx`)

`rounded-[var(--ui-radius)]`, **borde dashed** `--ui-border`, bg surface, `px-4 py-8`, centrado. Título `text-sm font-medium`; descripción `text-sm text-muted`; slot de acción debajo. Es el patrón único para tablas/listas vacías.

### 10.7 Panel (`Panel.tsx`)

`div.ui-panel` — contenedor genérico mínimo.

### 10.8 Sidebar (`Sidebar.tsx` + `sidebar.css`)

- **Estructura:** header 60px (logo 30px, radio `sm`, bg `--ui-brand`, texto blanco 700) + nav scrollable + footer con cuenta/logout.
- **Ítem** (`.sidebar-item`): `padding .55rem .6rem`, radio `sm`, `0.875rem/500`, icono 19px. **Hover** → cápsula + `--sidebar-item-hover-bg` + micro-animación del icono. **Activo** → cápsula + `--sidebar-item-active-bg` + tinta plena + `600` (selección silenciosa, sin color).
- **Badges de ítem:** contador rojo (`--ui-danger`, pill, blanco 700) y contador "turno activo" verde (`--ui-success-soft`/`--ui-success`, tabular).
- **Cuenta:** avatar 30px circular (`--ui-success-soft`), popover hacia arriba (radio 14, sombra de menú, `pop 0.12s`).
- **Móvil (≤767px):** off-canvas `translateX(-100%)` → `.mobile-open` + overlay `rgba(0,0,0,.32)`.

### 10.9 TopBar (`TopBar.tsx` + override Apple en `styles.css`)

64px, sticky, fondo translúcido con blur. **Eyebrow** `0.66rem/600/0.07em` gray-2; **título** `1.32rem/600/-0.02em` ink. **Switch de app** = contenedor pill (`--ap-canvas` + hairline) con botones de 28px; activo: surface + `box-shadow 0 1px 2px rgba(0,0,0,.08)`. Perfil de usuario separado por borde izquierdo; avatar con iniciales (`initials()` → máx. 2 letras).

### 10.10 Tabla de datos (`.catalog-table`, `catalog.css`) — patrón canónico

- `width:100%; border-collapse: collapse; font-size: 0.9rem; letter-spacing:-0.012em`.
- **`th`:** `0.7rem/600`, **uppercase** `0.05em`, color `--ui-text-soft`, `padding .55rem .85rem`, borde inferior `--ui-border-strong`; `thead th` con fondo surface-subtle.
- **`td`:** **altura de fila fija `3.5rem`** (homogénea entre tablas, lleve texto/badge/toggle/botón), `padding 0 .85rem`, `vertical-align: middle`, borde inferior `--ui-border`.
- **Fila hover:** bg `--ui-surface-subtle` (`transition .1s`).
- **Contenedor** (`.table-panel`): borde `--ui-border`, radio 18px, `overflow:hidden`, sombra `sm` (none en Apple). Toolbar/filtros de cabecera con altura mínima homogénea.

### 10.11 Tabs / segmented control (`.bo-tabs` / `.bo-tab`)

Contenedor pill (`inline-flex`, padding `.18rem`, bg surface-subtle + hairline). Tab: 30px, pill, `0.82rem/500`, texto muted→text; **activo**: bg surface + `600` + `box-shadow 0 1px 2px rgba(0,0,0,.08)`. Mismo patrón para el selector de periodo del dashboard.

### 10.12 Modal (`.modal-backdrop` + `.modal`, `catalog.css`)

- **Backdrop:** `fixed inset:0`, `z:50`, `rgba(10,20,19,.5)`, `display:grid; place-items:center; padding:1rem`.
- **Card:** bg surface, radio 18px, `padding 1.85rem`, `max-width: 30rem`, sombra `0 24px 70px -16px rgba(0,0,0,.4)`.
- **Formulario** (`.modal--form`): cabecera + **cuerpo scrollable** (`overflow-y:auto`) + **pie fijo**, `max-height: calc(100vh - 2rem)`. `.modal-row` = 2 columnas. Pie (`.modal-foot`) alineado a la derecha; botón secundario = pill con borde `--ui-border-strong`; primario = `.btn-primary`.

### 10.13 Drawer (`.drawer-backdrop` + `.store-log-drawer`)

Backdrop `z:60` `rgba(10,20,19,.45)`, contenido anclado a la derecha (`width: min(30rem,100%)`, full-height, `padding 1.5rem`, sombra de drawer, `slide-in 0.28s`).

### 10.14 Campo de búsqueda (`.search-field`)

Wrapper pill con **lupa lucide a la izquierda** pintada como máscara CSS (se tinta con `--ui-text-soft`); input con `padding-left: 2.6rem`; degradado de desvanecido a la derecha. Cuando envuelve un `<Select>` de filtro, el chrome lo aporta `.ui-select-trigger`.

### 10.15 KPI Card (`.dash-card`, `dashboard.css`)

`padding 1.15rem 1.25rem`, borde `--ui-border`, **radio 16px**, bg surface, `overflow:hidden`. Hover: borde `--ui-border-strong` + `translateY(-1px)`.

- **Label:** `0.72rem/600` uppercase `0.045em` soft.
- **Valor:** `1.72rem/600/-0.025em`, tabular.
- **Delta:** píldora `0.74rem/600` con par de color `dash-delta-up/-down/-flat` (`*-soft` + `ink`).
- **Trend overlay:** píldora que flota a caballo del **borde superior** (surface + hairline), flecha + % por signo.
- **Sparkline:** SVG **full-bleed** al pie (alto 44px), `stroke-width:1.5` `currentColor`, área en `*-soft`; color por estado (brand/up/down).

### 10.16 Data-viz (barras, familias, rankings)

- **Barras hoy vs ayer:** altura 248px; barra "Ayer" = `--ui-border-strong`; barra "Hoy" = gradiente de marca `linear-gradient(180deg, mix(brand 82% #fff), brand)`; línea base `--ui-border-strong`; cifra vertical dentro de la barra; entrada `dash-bar-rise` con stagger `--i*70ms`; al hover/selección, las demás columnas se atenúan a `opacity:.4`.
- **Barras por familia:** track pill surface-subtle; relleno gradiente de marca; importe dentro de la barra (blanco, tabular).
- **Rankings:** posición en chip circular (el #1 con `--ui-brand-soft-2` + `--ui-brand-ink`); medidor fino de 3px bajo cada fila (gradiente de marca); hover de fila surface-subtle.
- **Regla transversal de data-viz:** un único acento (marca) + tintes `-soft` para severidad; "enfocar atenuando el resto".

### 10.17 POS (TPV) — específicos (`sale.css`)

- **Tarjeta de producto** (`.prod-card`, es un `<button>`): `min-height:96px`, `padding .85rem`, **borde 1.5px** `--ui-border`, radio `lg`, bg surface; **hover**: borde `--ui-brand` + `box-shadow 0 6px 22px -10px rgb(0 0 0/.18)`; active `translateY(1px)`. (No va a cápsula.)
- **Total del carrito** (`.cart-total strong`): `--ui-text-3xl` (28px), 700, `-0.03em`, tabular.
- **Total de cobro** (`.pay-total-amount`): `--ui-text-4xl` (32px), 700, `-0.03em`, tabular.
- Steppers +/- conservan radio propio (fuera de la regla pill).

### 10.18 Popovers y menús desplegables (U-07)

TODO desplegable flotante (Select, flyouts del sidebar en rail, menú de cuenta,
resultados de la búsqueda de funciones, futuros menús) comparte UNA piel:

- **Contenedor:** fondo `--ui-surface` · borde 1px `--ui-border-strong` ·
  radio **12px** · sombra `--ui-shadow-md` · padding interior `0.3rem` ·
  animación de entrada 0.12s (`opacity` + 3-4px de desplazamiento) con
  `--ui-ease`; sin animación bajo `prefers-reduced-motion`.
- **Items:** radio 8px · hover/activo con `--ui-surface-subtle` (o tinte
  `--ui-brand-soft` si hay semántica de selección) · NUNCA se atenúan las
  opciones no seleccionadas (regla anti-gris, igual que los gráficos §10.16).
- **Cierre:** clic fuera + Escape, siempre.
- Base reutilizable: clases `ui-menu` / `ui-menu-item` / `ui-menu-item-hint`
  (theme.css); las variantes solo añaden posicionamiento.

### 10.19 Gráficos de barras y línea (revisión U-01/U-02)

- Barras gruesas (38px, máx. 56% de la columna), color constante: **nunca** se
  atenúa el resto al hover ni hay selección por color.
- **Sin cifras dentro de las barras**: el valor vive en el tooltip lateral
  (`ui-chart-tip`) que se materializa al hover/focus junto a la cima de la
  barra (en los extremos se alinea hacia dentro), y en el `aria-label`.
- Variante línea (`kind="line"`): misma escala, mismos labels y mismo tooltip;
  polyline `--ui-brand` (comparación en `--ui-border-strong`) con puntos.

---

## 11. Iconografía

- **Set:** Lucide (líneas, `stroke-width: 2`, `stroke-linecap/linejoin: round`). Algunos iconos se inyectan como **máscara CSS** para tintarse con tokens (p. ej. la lupa de búsqueda).
- **Tamaños:** icono de ítem de sidebar 19px; lupa de búsqueda 1.05rem; icono de botón/CTA 16px.
- **Color:** heredan `currentColor`/tokens; nunca color propio fijo.

### 11.1 Mapa acción → icono (U-14, vinculante)

Todo CTA/botón de acción lleva su icono; **un icono = una acción** en toda la app.
El `Button` acepta `icon` y pone hueco/alineación (no se compone a mano).

| Acción            | Icono (lucide) | Acción               | Icono         |
| ----------------- | -------------- | -------------------- | ------------- |
| Crear / nuevo     | `Plus`         | Importar             | `Upload`      |
| Guardar           | `Check`        | Exportar / descargar | `Download`    |
| Editar            | `Pencil`       | Imprimir             | `Printer`     |
| Borrar            | `Trash2`       | Reponer              | `PackagePlus` |
| Cancelar / cerrar | `X`            | Mover                | `Move`        |
| Buscar            | `Search`       | Ver                  | `Eye`         |
| Filtrar           | `Filter`       | Refrescar            | `RefreshCw`   |

Excepción admitida: botones de texto dentro de tablas densas si el icono añade
ruido (anotar en el PR). Los icon-only (sin texto) llevan `aria-label` y `title`.

---

## 12. Reglas y "no hacer"

1. **Un solo acento de color** (Action Blue). Nada de segundas marcas ni gradientes morados/azules decorativos. Gradiente permitido solo en data-viz (mezcla de marca con blanco).
2. **El color es escaso (regla ~10%).** Las superficies son neutras; el color aparece donde importa (estado, severidad, acento de dato, foco).
3. **La elevación por defecto es el hairline.** Sombras solo para overlays (menú/modal/toast/drawer).
4. **Cápsula (pill) según la regla por app** (§5). No poner la cuadrícula de producto ni los steppers en cápsula.
5. **Tipografía:** pesos 500/600/700; tracking negativo escalado; mayúsculas + tracking positivo solo para micro-etiquetas; siempre `tabular-nums` en cifras.
6. **Filas de tabla a 3.5rem** y controles a `--bo-control-height` para densidad homogénea.
7. **Movimiento:** una sola curva (`--ui-ease`) y tres tiempos; respetar `prefers-reduced-motion`.
8. **Accesibilidad:** foco con `:focus-visible` + `--ui-focus`; contraste AA; ARIA correcto en overlays.
9. **Nunca hardcodear** un hex/medida en un componente: usar `--ui-*` o utilidades `rounded-*`. Si falta un token, se añade al sistema, no al componente. (U-15) Esto incluye los **fallbacks** de `var()`: nada de `var(--x, #a9a9a9)` con un gris/semántico literal, ni tokens huérfanos legacy (`--tpv-*`, `--border`, `--ui-accent`); referenciar siempre el token canónico `--ui-*` sin fallback hardcodeado. La escala de grises vive en §3.1 (`--ui-bg/surface/surface-subtle/border/border-strong/text-*`).

---

## 13. Cómo extender el sistema (sin desviarse)

- **Color/medida nuevos** → añadir/editar el token en `packages/ui/src/styles/theme.css` (capa base) y, si afecta a la marca, su equivalente Apple en `apps/*/src/styles.css`. Mantener backoffice y tpv en paridad.
- **Componente compartido nuevo** → vive en `packages/ui/src/components/`, se exporta en `packages/ui/src/index.ts`, consume tokens `--ui-*`, sin Tailwind si debe renderizar también en el TPV (ver patrón de `Alert`).
- **Radios desde Tailwind** → usar `rounded-xs..xl` (apuntan a `--ui-radius-*` vía `@theme inline`).
- **Antes de crear una variante**, comprueba si un token o patrón existente ya la cubre. Consistencia > novedad.
