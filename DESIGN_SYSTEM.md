# Sistema de diseño — qrush retail / simpleTPV

> **Estado:** congelado a partir de la interfaz actual (extraído 1:1 de las fuentes de estilo del repo).
> **Propósito:** definir de forma exacta y exhaustiva el aspecto y el comportamiento que tiene HOY nuestra
> interfaz, para no desviarnos del estilo original. Cualquier pantalla nueva debe poder describirse con
> estos tokens y patrones; si algo no encaja, primero se discute el token, no se inventa un valor suelto.
>
> **Nota sobre `DESIGN.md`:** ese archivo es la _referencia estética externa_ (análisis de Apple.com) que
> inspiró el lenguaje. **Este** documento (`DESIGN_SYSTEM.md`) es el sistema real, implementado y vigente.
> **Migración a Geist (jun 2026):** sistema ahora vivo en **Fundación Geist** (Vercel Design System):
> grises fríos, azul Vercel, Geist Sans autohospedada, botones 8px, tarjetas planas, hairlines.

---

## 0. Cómo leer y usar este documento

- **Fuentes de verdad (no hardcodear hex):**
  - Capa base de tokens: `packages/ui/src/styles/theme.css`
  - **Fundación Geist viva**: `packages/ui/src/styles/theme-geist.css` (remapea TODOS los `--ui-*`; autohospedada Geist Sans, botones 8px, tarjetas planas, azul Vercel)
  - Importada por: `apps/backoffice/src/styles.css` y `apps/tpv/src/styles.css` → `@import '@simpletpv/ui/theme-geist.css'`
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
Capa 2 — FUNDACIÓN GEIST (packages/ui/src/styles/theme-geist.css)  ←★ ESTE ES EL ASPECTO VIVO
         Remapea TODOS los --ui-* a la paleta Geist: azul Vercel #0070f3,
         lienzo blanco roto #fafafa, tinta #18181b, hairlines, Geist Sans,
         botones 8px, radios 12px, tarjetas planas, grises fríos 6 niveles.
         Modo oscuro: data-theme="dark" en <html>, lienzo #0a0a0a, tinta #fafafa.
         Importada por ambas apps vía @simpletpv/ui/theme-geist.css.
                    │
                    ▼
Capa 3 — TAILWIND @theme inline (apps/*/src/styles.css)
         Mapea radius-xs..xl de Tailwind a los tokens --ui-radius-*
         → `rounded-lg` y `var(--ui-radius-lg)` rinden idéntico.
```

> **Conclusión operativa:** el aspecto real de ambas apps es la **Fundación Geist** (capa 2). La capa base
> (teal/neutro) solo se vería si una app dejara de remapear. Las tablas de abajo dan **ambos** valores:
> el `BASE` (contrato) y el `VIVO (Geist)` (lo que se ve).

---

## 3. Color

### 3.1 Superficies y bordes (modo claro)

| Token                     | BASE (theme.css) | VIVO (Geist)         | Uso                                                          |
| ------------------------- | ---------------- | -------------------- | ------------------------------------------------------------ |
| `--ui-bg`                 | `#f6f6f4`        | `#fafafa`            | Lienzo de la app (blanco roto)                               |
| `--ui-surface`            | `#ffffff`        | `#ffffff`            | Cards, paneles, menús, inputs                                |
| `--ui-surface-subtle`     | `#f4f4f2`        | `#f4f4f5`            | Zebra, hover de fila, fondos de tab/track                    |
| `--ui-border`             | `#e6e5e0`        | `#e8e8eb` (hairline) | Hairline suave (la elevación por defecto)                    |
| `--ui-border-strong`      | `#d8d6cf`        | `#d6d6da`            | Hairline marcado, líneas base de gráficas, bordes de control |
| `--ap-pearl` (solo Geist) | —                | `#f6f6f7`            | Superficie sutil adicional                                   |

### 3.2 Texto (modo claro)

| Token             | BASE      | VIVO (Geist) | Uso                                      | Contraste sobre canvas |
| ----------------- | --------- | ------------ | ---------------------------------------- | ---------------------- |
| `--ui-text`       | `#18181a` | `#18181b`    | Titulares y cuerpo (tinta)               | ~16:1                  |
| `--ui-text-muted` | `#6b6b66` | `#52525b`    | Texto secundario (gris)                  | 7:1 AA                 |
| `--ui-text-soft`  | `#71706c` | `#71717a`    | Texto terciario, placeholders, etiquetas | 4.6:1 AA               |

> **WCAG (revisión 2026-06-24):** todos los tokens cumplen AA sobre `--ui-bg` (`#fafafa`)
> y `--ui-surface` (`#ffffff`). Primario 16:1, secundario 7:1, terciario 4.6:1.
> Modo oscuro con rampa 6 niveles adicional (ver §12-bis).

### 3.3 Acción primaria y marca (modo claro)

| Token                | BASE              | VIVO (Geist)            | Uso                                                              |
| -------------------- | ----------------- | ----------------------- | ---------------------------------------------------------------- |
| `--ui-primary`       | `#171717` (tinta) | `#0070f3` (azul Vercel) | Botón primario, enlaces, foco                                    |
| `--ui-primary-hover` | `#000000`         | `#005bd3`               | Hover del primario                                               |
| `--ui-primary-fg`    | `#ffffff`         | `#ffffff`               | Texto sobre primario                                             |
| `--ui-brand`         | `#0e7c6b` (teal)  | `#0070f3`               | **Único acento de data-viz**: barras, dots, medidores, activos   |
| `--ui-brand-ink`     | `#0a5447`         | `#0061d1`               | Texto/iconos de acento (check de Select, posición #1) — AA 4.5:1 |
| `--ui-brand-soft`    | `#0e7c6b14`       | `rgba(0,112,243,.10)`   | Relleno suave de acento (opción activa, área de sparkline)       |
| `--ui-brand-soft-2`  | `#0e7c6b22`       | `rgba(0,112,243,.18)`   | Acento un punto más sólido (chip de podio)                       |

> **En Geist, marca = primario = azul Vercel (#0070f3).** No hay dos acentos. El color es escaso por diseño.

### 3.4 Semántica (modo claro)

| Rol     | Token ink / soft — BASE | Token ink / soft — VIVO (Geist) |
| ------- | ----------------------- | ------------------------------- |
| Peligro | `#c0392b` / `#fbeae7`   | `#d6201f` / `#fdecec`           |
| Aviso   | `#b45309` / `#fdf4e6`   | `#ab5300` / `#fff3e2`           |
| Éxito   | `#16734f` / `#e8f3ec`   | `#117a3b` / `#e8f6ee`           |

Patrón de uso: **`-soft` como fondo + `ink` como texto/icono** (píldoras de estado, badges de severidad, toasts).

### 3.5 Sidebar (tokens dedicados, modo claro)

| Token                                               | BASE                | VIVO (Geist)          |
| --------------------------------------------------- | ------------------- | --------------------- |
| `--sidebar-bg`                                      | `#ffffff`           | `#ffffff` (surface)   |
| `--sidebar-item-active-bg`                          | `rgb(0 0 0 / .07)`  | `rgba(0,0,0,.06)`     |
| `--sidebar-item-hover-bg`                           | `rgb(0 0 0 / .042)` | `rgba(0,0,0,.038)`    |
| `--sidebar-text`                                    | `#6b6b66`           | `#52525b`             |
| `--sidebar-text-active`                             | `= --ui-text`       | `#18181b`             |
| `--sidebar-group-label-color`                       | `#8d897f`           | `#52525b` (AA a 11px) |
| `--sidebar-width-rail` / `--sidebar-width-expanded` | `56px` / `232px`    | igual                 |

**Selección "silenciosa" estilo ChatGPT:** el ítem activo NO usa color; usa relleno neutro + tinta plena. El único color del sidebar vive en el logotipo y el anillo de foco.

---

## 4. Tipografía

### 4.1 Familias

- **VIVO (apps):** **Geist Sans** (pesos 400/500/600/700) autohospedada en `packages/ui/src/styles/fonts/*.woff2` (subset latin, vendorizada, `@font-face` en theme-geist.css), cae a Inter si fallara. **Geist Mono** para códigos (SKU/EAN).
- **BASE (theme.css):** fallback a `Inter, ui-sans-serif, system-ui, -apple-system, …`
- **Monoespaciada (impresión / ESC-POS, tickets):** `ui-monospace, monospace` / `'Courier New'`.
- **Numéricos:** `font-variant-numeric: tabular-nums` global en el `body` → las cifras no bailan de ancho. **Regla anti-Mono:** NO usar Geist Mono en cifras con separador de miles (separa raro); usar Geist Sans tabular.

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

Escala única por rol (`--ui-radius-*`). En la **Fundación Geist** botones e inputs usan 8px (SIN cápsula):

| Token              | BASE  | VIVO (Geist) | Rol                                                                 |
| ------------------ | ----- | ------------ | ------------------------------------------------------------------- |
| `--ui-radius-xs`   | 6px   | 6px          | insignias, kbd, micro-controles, cabeceras de grupo sidebar         |
| `--ui-radius-sm`   | 8px   | 8px          | **botones, chips, inputs, selects** — Sin cápsula por defecto       |
| `--ui-radius-md`   | 10px  | 12px         | filas de lista, ítems internos                                      |
| `--ui-radius-lg`   | 12px  | 12px         | tarjetas, paneles, barras de búsqueda, tablas, modales              |
| `--ui-radius-xl`   | 16px  | 12px         | superficies grandes (KPI cards colapsan a lg)                       |
| `--ui-radius-pill` | 999px | 999px        | **SOLO iconos circulares del clúster flotante** (.float-action-btn) |

**Regla de-pill de Geist (cambio importante):**

- **Botones, inputs, selects:** radio **8px** (sm), NO cápsula. Cambio: en `apps/backoffice/src/styles.css` `.app-shell button` y `.ui-select-trigger` pasan de `9999px` a `var(--ui-radius-sm)`.
- **Excepción:** los botones-icono del clúster flotante (`.float-action-btn`) son **CÍRCULOS** (`9999px`): regla adicional `.app-shell .float-action-btn { border-radius: 9999px }`.
- **Sidebar:** mantiene su tratamiento (selección activa cápsula suave).

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

> **Filosofía Geist: la elevación es el hairline, no la sombra. Tarjetas PLANAS.** En la capa viva, `--ui-shadow-sm` y `--ui-shadow-panel` son `none`. La profundidad real se reserva para overlays (menús, modales, toasts, drawers).

| Token               | Valor (BASE)                         | VIVO (Geist)          | Uso                       |
| ------------------- | ------------------------------------ | --------------------- | ------------------------- |
| `--ui-shadow-sm`    | `0 1px 2px rgb(0 0 0 / .045)`        | `none`                | Elevación mínima de panel |
| `--ui-shadow-md`    | `0 4px 16px -6px rgb(0 0 0 / .12)`   | `0 4px 16px -6px …`   | Toasts                    |
| `--ui-shadow-lg`    | `0 12px 32px -12px rgb(0 0 0 / .22)` | `0 12px 32px -12px …` | (reservado para overlays) |
| `--ui-shadow-panel` | `0 1px 3px /.06, 0 1px 2px /.04`     | `none`                | Paneles (hairline solo)   |

Sombras concretas de overlays (no tokenizadas, valores literales canónicos):

- **Menú flotante (Select / cuenta):** `0 0 0 0.5px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.14)`
- **Modal:** `0 24px 70px -16px rgba(0,0,0,.4)`
- **Drawer:** `-24px 0 70px -24px rgba(0,0,0,.45)`
- **Backdrops:** modal `rgba(10,20,19,.5)`, drawer `rgba(10,20,19,.45)`, overlay móvil sidebar `rgba(0,0,0,.32)`.

---

## 7. Foco y accesibilidad

- **Anillo de foco** (`--ui-focus`): BASE `0 0 0 3px var(--ui-brand-soft-2)`; **VIVO (Geist)** `0 0 0 4px rgba(0,112,243,.32)`. Se aplica con `:focus-visible` (no `:focus`) en sidebar, select, cuenta, etc.
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

### 10.15 KPI Card → "KPI / rejilla conectada" (`.dash-kpi-row`, `dashboard.css`)

Los KPIs van en **rejilla CONECTADA con hairline** (estilo Vercel Analytics):

- **Contenedor** (`.dv-kpi-row`): `grid` con `gap:1px` + `background: var(--ui-border)` + `border:1px solid var(--ui-border)` + `border-radius:12px` + `overflow:hidden`.
- **Celda individual** (`.dv-kpi-tile`): `background: var(--ui-surface)` + padding `1.15rem 1.25rem`; el gap de 1px actúa como divisor (hairline) entre celdas.
- **Label:** `0.72rem/600` uppercase `0.045em` soft.
- **Valor:** `1.72rem/600/-0.025em`, tabular (**Geist Sans**, NO Mono).
- **Delta:** píldora `0.74rem/600` con par de color `dash-delta-up/-down/-flat` (`*-soft` + `ink`).
- **Trend overlay:** píldora que flota a caballo del **borde superior** (surface + hairline), flecha + % por signo.
- **Sparkline:** SVG **full-bleed** al pie (alto 44px), `stroke-width:1.5` `currentColor`, área en `*-soft`; color por estado (brand/up/down).

### 10.16 Data-viz → Monocromía (barras, familias, rankings)

- **Paleta categórica reconvertida a monocromía de acento + gris:**
  - cat-1 `#0070f3` (serie principal/"hoy", azul)
  - cat-2 `#52525b` (comparación/"ayer", gris)
  - cat-3 `#005bd3` (azul oscuro)
  - cat-4 `#a1a1aa` (gris claro)
  - cat-5 `#3f3f46` (gris oscuro)
  - cat-6 `#4aa3ff` (azul claro)
  - cat-7 `#d6d6da` (gris muy claro)
  - cat-8 `#a1a1aa` (gris medio)
- **Barras hoy vs ayer:** altura 248px; barra "Ayer" = `#52525b`; barra "Hoy" = `#0070f3` (primaria, sin gradiente); línea base `--ui-border-strong`; cifra vertical dentro de la barra (blanco); entrada `dash-bar-rise` con stagger `--i*70ms`; al hover/selección, las demás columnas se atenúan a `opacity:.4`.
- **Barras por familia:** track surface-subtle; relleno monocromo serie primaria (`#0070f3`); importe dentro de la barra (blanco, tabular, Geist Sans).
- **Rankings:** posición en chip circular (el #1 con `--ui-brand-soft-2` + `--ui-brand-ink`); medidor fino de 3px bajo cada fila (monocromo `#0070f3`); hover de fila surface-subtle.
- **Tooltip:** oscuro invertido (bg `#18181b`, fg `#ffffff`) para contraste máximo.
- **Regla transversal de data-viz:** un único acento (azul Vercel `#0070f3`) + gris para comparación; NO arcoíris; "enfocar atenuando el resto".

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

## 11.2 Modo oscuro (`data-theme="dark"`)

El modo oscuro se controla con el atributo `data-theme="dark"` en el elemento `<html>`. Todos los tokens `--ui-*` se redeclaran en `:root[data-theme='dark']` dentro de `theme-geist.css`.

**Controles:**

- Toggle luna/sol en el clúster flotante (`apps/backoffice/src/components/FloatingActions.tsx`).
- Persistencia: `apps/backoffice/src/lib/theme.ts` con `localStorage`.
- Script anti-parpadeo: `apps/backoffice/index.html` fija el tema antes de pintar → respeta `prefers-color-scheme` en primera carga.

**Rampa oscura de 6 niveles escalonados (modo oscuro):**

| Token                 | Valor     | Uso                              |
| --------------------- | --------- | -------------------------------- |
| `--ui-bg`             | `#0a0a0a` | Lienzo principal (casi negro)    |
| `--ui-surface-subtle` | `#141417` | Relleno sutil (nivel 1)          |
| `--ui-surface`        | `#1e1e22` | Cartas/paneles (nivel más claro) |
| `--ui-surface-strong` | `#24242a` | Pista/track (nivel 2)            |
| `--ui-border`         | `#2e2e35` | Hairline suave                   |
| `--ui-border-strong`  | `#3d3d45` | Hairline marcado                 |

**Texto oscuro:**

- `--ui-text` = `#fafafa` (primario, ~16:1 sobre bg)
- `--ui-text-muted` = `#b3b3bb` (secundario, ~7:1 AA)
- `--ui-text-soft` = `#8a8a93` (terciario, ~5:1 AA)

**Acento oscuro (azul):**

- `--ui-primary` / `--ui-brand` = `#3b9eff` (más claro para legibilidad)
- `--ui-primary-hover` / `--ui-brand-ink` = `#5aacff`
- `--ui-brand-soft` = `rgba(59,158,255,.10)`
- `--ui-brand-soft-2` = `rgba(59,158,255,.18)`

**Semántica oscura (luminosa):**

- Peligro: `#ff6166` (ink) / `rgba(255,97,102,.15)` (soft)
- Aviso: `#f5a623` (ink) / `rgba(245,166,35,.12)` (soft)
- Éxito: `#3ecf8e` (ink) / `rgba(62,207,142,.12)` (soft)

**Sidebar oscuro:**

- `--sidebar-bg` = `#0e0e10`
- `--sidebar-item-active-bg` = `rgba(255,255,255,.10)`
- `--sidebar-item-hover-bg` = `rgba(255,255,255,.05)`
- `--sidebar-text` = `#b3b3bb`
- `--sidebar-text-active` = `#fafafa`

**Tooltip oscuro:**

- bg `#27272a` (no totalmente negro para suavidad)
- fg `#fafafa`

> **Implementación:** casi todo se deriva de `--gst-*` / `--gst-blue-*` invertidos (Geist design tokens);
> solo se redeclaran los `--ui-*` literales. Foco oscuro: `0 0 0 4px rgba(59,158,255,.32)`.

---

## 12. Reglas y "no hacer"

1. **Un solo acento de color** (azul Vercel `#0070f3`). Nada de segundas marcas ni gradientes morados/arcoíris. Marca = primario = único acento.
2. **El color es escaso (regla ~10%).** Las superficies son neutras (grises fríos 6 niveles); el color aparece donde importa (estado, severidad, acento de dato, foco).
3. **La elevación por defecto es el hairline.** Tarjetas PLANAS. Sombras solo para overlays (menú/modal/toast/drawer).
4. **Botones, inputs, selects = 8px (radio-sm), NO cápsula.** Excepción: botones-icono del clúster flotante (`.float-action-btn`) CÍRCULOS. Regla: `.app-shell .float-action-btn { border-radius: 9999px }`.
5. **Tipografía:** familia **Geist Sans** (pesos 400/500/600/700 autohospedada); pesos 500/600/700 en UI; tracking negativo escalado; mayúsculas + tracking positivo solo para micro-etiquetas; siempre `tabular-nums` en cifras (NO Geist Mono con separador de miles — usar Geist Sans tabular). Cifra de stat/KPI (`.dv-stat-value`): 600, `-0.025em`, `line-height:1`.
6. **Filas de tabla a 3.5rem** y controles a `--bo-control-height` para densidad homogénea.
7. **Movimiento:** una sola curva (`--ui-ease`) y tres tiempos; respetar `prefers-reduced-motion`.
8. **Accesibilidad:** foco con `:focus-visible` + `--ui-focus`; contraste AA mínimo (primario 16:1, secundario 7:1, terciario 4.5:1); ARIA correcto en overlays.
9. **Nunca hardcodear** un hex/medida en un componente: usar `--ui-*` o utilidades `rounded-*`. Si falta un token, se añade al sistema, no al componente. Esto incluye los **fallbacks** de `var()`: nada de `var(--x, #a9a9a9)` con un gris/semántico literal, ni tokens huérfanos legacy (`--tpv-*`, `--border`, `--ui-accent`); referenciar siempre el token canónico `--ui-*` sin fallback hardcodeado. La escala de grises vive en §3.1 y §11.2 (`--ui-bg/surface/surface-subtle/border/border-strong/text-*`).
10. **Modo claro + oscuro deliberados:** ambos modos con intención, no colores por defecto. Toggle luna/sol accesible. **Rampa oscura precisa:** 6 niveles escalonados distintos (no monotono gris).
11. **Data-viz monocromática:** serie principal azul (`#0070f3`), comparación/demás en gris; NO arcoíris categórico.

---

## 13. Cómo extender el sistema (sin desviarse)

- **Color/medida nuevos** → añadir/editar el token en `packages/ui/src/styles/theme.css` (capa base) y, si afecta a la marca, su equivalente Geist en `packages/ui/src/styles/theme-geist.css` (importada por ambas apps). Mantener backoffice y tpv en paridad.
- **Componente compartido nuevo** → vive en `packages/ui/src/components/`, se exporta en `packages/ui/src/index.ts`, consume tokens `--ui-*`, sin Tailwind si debe renderizar también en el TPV (ver patrón de `Alert`).
- **Radios desde Tailwind** → usar `rounded-xs..xl` (apuntan a `--ui-radius-*` vía `@theme inline`).
- **Antes de crear una variante**, comprueba si un token o patrón existente ya la cubre. Consistencia > novedad.
- **Modo oscuro:** redeclarar tokens en `:root[data-theme='dark']` dentro de `theme-geist.css` (no crear fichero separado). Prueba ambos modos antes de merge.
