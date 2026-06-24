---
version: alpha
name: Geist-design-reference
description: Sistema de diseño Geist (Vercel Analytics). Premium, minimalista, data-first. Grises neutros FRÍOS, un único acento azul eléctrico, tipografía Geist aguda, radios 12px en superficies (8px en controles), hairlines en lugar de sombras, monocromía en data-viz, números tabulares en cifras.

colors:
  canvas-light: '#fafafa'
  surface-light: '#ffffff'
  surface-subtle: '#f4f4f5'
  hairline: '#e8e8eb'
  hairline-strong: '#d6d6da'
  text-primary: '#18181b'
  text-secondary: '#52525b'
  text-tertiary: '#71717a'
  accent-blue: '#0070f3'
  accent-blue-hover: '#005bd3'
  accent-blue-text: '#0061d1'
  semantic-success: '#117a3b'
  semantic-success-tint: '#dcf5ec'
  semantic-warning: '#ab5300'
  semantic-warning-tint: '#fce4ce'
  semantic-danger: '#d6201f'
  semantic-danger-tint: '#f9dede'

  canvas-dark: '#0a0a0a'
  surface-dark-subtle: '#141417'
  surface-dark: '#1e1e22'
  surface-dark-hover: '#24242a'
  hairline-dark: '#2e2e35'
  hairline-dark-strong: '#3d3d45'
  text-dark-primary: '#fafafa'
  text-dark-secondary: '#b3b3bb'
  text-dark-tertiary: '#8a8a93'
  accent-blue-dark: '#3b9eff'
  semantic-success-dark: '#3ecf8e'
  semantic-warning-dark: '#f5a623'
  semantic-danger-dark: '#ff6166'

typography:
  display-xl:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.025em
  display-lg:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.025em
  display-md:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.025em
  heading:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  subheading:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  body-strong:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-small:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  label-strong:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.045em
    textTransform: uppercase
  label:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  caption:
    fontFamily: 'Geist Sans, -apple-system, system-ui, BlinkMacSystemFont, sans-serif'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  mono:
    fontFamily: 'Geist Mono, monospace'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0

rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  control: 8px
  surface: 12px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px

components:
  button-primary:
    backgroundColor: '{colors.accent-blue}'
    textColor: '#ffffff'
    typography: '{typography.body-strong}'
    rounded: '{rounded.control}'
    padding: 8px 16px
    height: 36px
  button-secondary:
    backgroundColor: '{colors.surface-subtle}'
    textColor: '{colors.text-primary}'
    border: '1px solid {colors.hairline}'
    typography: '{typography.body-strong}'
    rounded: '{rounded.control}'
    padding: 8px 16px
    height: 36px
  button-ghost:
    backgroundColor: transparent
    textColor: '{colors.text-primary}'
    typography: '{typography.body-strong}'
    rounded: '{rounded.control}'
    padding: 8px 16px
    height: 36px
  button-danger:
    backgroundColor: '{colors.semantic-danger}'
    textColor: '#ffffff'
    typography: '{typography.body-strong}'
    rounded: '{rounded.control}'
    padding: 8px 16px
    height: 36px
  input-default:
    backgroundColor: '{colors.surface-light}'
    textColor: '{colors.text-primary}'
    border: '1px solid {colors.hairline}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: 8px 12px
    height: 36px
  input-focus:
    border: '2px solid {colors.accent-blue}'
    outline: 'none'
  badge-semantic:
    backgroundColor: '{colors.semantic-success-tint}'
    textColor: '{colors.semantic-success}'
    typography: '{typography.label-strong}'
    rounded: '{rounded.surface}'
    padding: 4px 8px
  badge-warning:
    backgroundColor: '{colors.semantic-warning-tint}'
    textColor: '{colors.semantic-warning}'
    typography: '{typography.label-strong}'
    rounded: '{rounded.surface}'
    padding: 4px 8px
  badge-danger:
    backgroundColor: '{colors.semantic-danger-tint}'
    textColor: '{colors.semantic-danger}'
    typography: '{typography.label-strong}'
    rounded: '{rounded.surface}'
    padding: 4px 8px
  card-default:
    backgroundColor: '{colors.surface-light}'
    border: '1px solid {colors.hairline}'
    rounded: '{rounded.surface}'
    padding: 16px
  modal-overlay:
    backgroundColor: 'rgba(0, 0, 0, 0.45)'
  modal-content:
    backgroundColor: '{colors.surface-light}'
    rounded: '{rounded.surface}'
    boxShadow: '0 12px 56px rgba(0, 0, 0, 0.15)'
  table-header:
    backgroundColor: '{colors.surface-subtle}'
    textColor: '{colors.text-secondary}'
    typography: '{typography.label-strong}'
  table-row-zebra:
    backgroundColor: '{colors.surface-subtle}'
  topbar-default:
    backgroundColor: '{colors.surface-light}'
    border: '1px solid {colors.hairline}'
    height: 56px
  sidebar-floating:
    backgroundColor: '{colors.surface-light}'
    border: '1px solid {colors.hairline}'
    rounded: '{rounded.surface}'
    padding: 0
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
---

## Overview

**Geist es el lenguaje visual de Vercel Analytics**: premium, minimalista, data-first. No copia Geist; se basa en él — la interfaz respira aire, los datos hablan, una sola acción es clara.

Seis niveles de gris neutro (frío, no cálido) en claro; modo oscuro a seis niveles más; un único azul eléctrico (`#0070f3`) para toda interacción; tipografía Geist Sans aguda con tracking ceñido; radios 12px en tarjetas/paneles (8px en controles), nunca cápsulas salvo circulares; hairlines `1px` en lugar de sombras de chrome (solo sombra en overlays); monocromía de datos (gris + azul, sin arcoíris); números tabulares en TODA cifra; claro y oscuro intencionales, ninguno por defecto.

**Espíritu:** No es "diseño limpio" genérico. Es `data-driven`, `grid-based`, `type-forward`. Tarjetas planas. Elevación por color, no por sombra. Hairlines que acotan. Control +8px en altura/width (36px típico), superficie 12px de radius. Modo oscuro 6-level ramp para contraste preciso. Toggle claro/oscuro en el clúster flotante (luna/sol), respeta SO, anti-parpadeo.

> **Nota importante:** Los tokens exactos (colores RGB, pesos tipográficos, espacios) están definidos en `DESIGN_SYSTEM.md`. Esta referencia es la guía VISUAL e inspiracional de Geist. Los valores que ves aquí son literales de `packages/ui/src/styles/theme-geist.css` — úsalos como punto de partida, no como gospel técnico. El código vive en los archivos.

---

## Colores — Filosofía Cromática

### Light Mode — Rampa Neutral 6 Niveles

El modo claro construye sobre **lienzo `#fafafa`** (casi blanco, muy suave):

- **Lienzo**: `#fafafa` — fondo de página; aire.
- **Superficie primaria**: `#ffffff` — tarjetas, paneles, inputs; donde vive el contenido.
- **Sutil**: `#f4f4f5` — hover de superficies, filas alternas en tablas; apenas perceptible.
- **Hairline blando**: `#e8e8eb` — borde `1px` en inputs, tarjetas, divisores; visual light, no pesado.
- **Hairline marcado**: `#d6d6da` — borde más fuerte en elementos deshabilitados o contrastes altos.

**Texto:**

- **Primario** `#18181b` — encabezados, body, navegación; nearblack, no puro negro.
- **Secundario** `#52525b` — descripciones, helper text, etiquetas.
- **Terciario** `#71717a` — disabled, fine-print.

**Semántica:**

- **Éxito** `#117a3b` verde / tinte `#dcf5ec` para badges.
- **Aviso** `#ab5300` naranja / tinte `#fce4ce` para alerts.
- **Peligro** `#d6201f` rojo / tinte `#f9dede` para errores.

**Acento (el único color de marca):**

- **Azul `#0070f3`** — botones primarios, links, anillos de foco, el "click me" universal.
- **Hover** `#005bd3` — estado pressed.
- **Texto/links AA** `#0061d1` — enlaces en cuerpo.

### Dark Mode — Rampa 6 Niveles (Clave de Oscuridad)

El modo oscuro construye sobre **lienzo `#0a0a0a`** (casi puro negro):

Rampa ascendente de oscuridad:

1. **Lienzo** `#0a0a0a` — fondo de página.
2. **Sutil** `#141417` — apenas más claro.
3. **SUPERFICIE (tarjetas/paneles)** `#1e1e22` — nivel más claro; este es el "lift" donde viven las tarjetas.
4. **Hover/pista** `#24242a` — hover de superficies.
5. **Borde blando** `#2e2e35` — hairline suave.
6. **Borde fuerte** `#3d3d45` — hairline marcado, disabled.

**Texto oscuro:**

- `#fafafa` — primario (blanco suave).
- `#b3b3bb` — secundario.
- `#8a8a93` — terciario.

**Acento azul oscuro** `#3b9eff` — más brillante que en claro (contrast-safe).

**Semántica oscura:**

- Éxito: `#3ecf8e` — verde más brillante.
- Aviso: `#f5a623` — naranja más brillante.
- Peligro: `#ff6166` — rojo más brillante.

**Implementación:** `data-theme="dark"` en `<html>`. Script anti-parpadeo en `<head>` que respeta `prefers-color-scheme` del SO antes de que React pinte. Toggle luna/sol en la esquina flotante.

---

## Tipografía — Geist Sans + Geist Mono

### Familia

- **Geist Sans** (400, 500, 600) — autohospedada `woff2`, vendorizada, fallback a Inter o `system-ui`.
- **Geist Mono** — para SKU, EAN, código; `font-variant-numeric: tabular-nums` SIEMPRE.

### Escala de Pesos

La escalera Geist es **400 / 500 / 600** (no 300, no 700):

- **400** — body, description, secondary.
- **500** — label, button, input placeholder.
- **600** — heading, display, strong emphasis.

### Tracking Ceñido (Geist Signature)

Display sizes (`28px` y mayores) llevan `letter-spacing: -0.025em` (tracking apretado = voz aguda, geométrica, futura). Body y control lleva `0` (neutro).

### Escala de Tamaños

| Token          | Size | Weight | Line-Height | Use                           |
| -------------- | ---- | ------ | ----------- | ----------------------------- |
| `display-xl`   | 48px | 600    | 1.1         | Hero, títulos página          |
| `display-lg`   | 36px | 600    | 1.15        | Section heads, modal titles   |
| `display-md`   | 28px | 600    | 1.2         | Tarjeta titles, grandes KPI   |
| `heading`      | 24px | 600    | 1.25        | Subsection, panel             |
| `subheading`   | 18px | 600    | 1.3         | Card h2, sidebar title        |
| `body-strong`  | 16px | 500    | 1.4         | Button, input label, emphasis |
| `body`         | 16px | 400    | 1.5         | Paragraph, description        |
| `body-small`   | 14px | 400    | 1.5         | Helper, secondary copy        |
| `label-strong` | 12px | 600    | 1.2         | UPPERCASE badge, column head  |
| `label`        | 12px | 500    | 1.2         | Etiqueta, sub-label           |
| `caption`      | 11px | 400    | 1.4         | Fine-print, disabled, tooltip |
| `mono`         | 13px | 500    | 1.35        | SKU, EAN, trace ID, timestamp |

### Números Tabulares (CRÍTICO)

TODOS los números en la UI usan `font-variant-numeric: tabular-nums`:

- Cifras KPI (ingresos, unidades, % TPV).
- Timestamps.
- Tablas de datos.
- Campos de cantidad.

Razón: los números tabulares alinean verticalmente en columnas; monoespaciados. Sin esto, un "8" y un "0" ocupan ancho distinto → columna de datos salta.

**Excepción:** Si la cifra lleva separador de miles en UI (ej. "8.420€"), NO uses Geist Mono (separa raro); usa Geist Sans tabular.

### Números KPI — Estilo Especial

Cuando una cifra es el **KPI principal** de una tarjeta/panel:

- Peso **600**.
- Tracking **-0.025em** (apretado).
- Line-height **1** (sólido, sin aire).
- Color primario o acento según contexto.

Ejemplo: en una tarjeta de "Ventas hoy", la cifra central es `display-md` peso 600, tracking -0.025em, color azul.

---

## Formas — Border Radius y Geometría

### Scale de Radios

| Token     | Value  | Use                                                 |
| --------- | ------ | --------------------------------------------------- |
| `none`    | 0px    | Full-bleed sections, fotograf                       |
| `sm`      | 4px    | Ícono pequeño, detalles                             |
| `md`      | 6px    | Rare; no usar salvo caso especial                   |
| `lg`      | 8px    | **Controles** (botones, inputs, selects)            |
| `control` | 8px    | Alias de `lg`; canonical para controles             |
| `surface` | 12px   | **Tarjetas, paneles, modales, menús**               |
| `full`    | 9999px | Botón-ícono circular (excepción única de "cápsula") |

### Geometría

- **Botones**: 36px alto (padded 8px top/bottom), 8px radius — rectángulo suave.
- **Inputs**: idem, 36px × 8px radius.
- **Tarjetas/paneles**: 12px radius — suave sin ser cápsulado.
- **Modales**: 12px radius + sombra overlay.
- **Botón-ícono circular**: 36px × 36px × 9999px radius (true circle).

**No hay cápsulas.** Las cápsulas (`rounded.full` en no-iconos) quedaron atrás con el viejo Apple design. Geist es rectángulo suave + ícono circular.

---

## Elevación & Profundidad

### Filosofía

Geist rechaza sombras voluminosas de "chrome". En su lugar:

- **Tarjetas planas**: borde hairline `1px {colors.hairline}` sin sombra.
- **Hover/active**: cambio de color de superficie (light → sutil) o hairline + color.
- **Overlay (modales, menús)**: ÚNICA sombra permitida: `0 12px 56px rgba(0, 0, 0, 0.15)` (soft, grande, lejos).
- **Modo oscuro**: sombras ligeramente más marcadas + lift por color de superficie.

**Elevación ocurre por:**

1. Color de superficie (lienzo ← sutil ← superficie primaria).
2. Hairline (contraste contra el fondo).
3. Sombra SOLO en overlay (modal, dropdown, tooltip).

---

## Data Visualization — Monocromía Vercel Analytics

### Colores de Datos

- **Serie principal ("hoy")**: azul `#0070f3`.
- **Serie comparación ("ayer", trending, alt)**: gris `#52525b` o `#8a8a93` (énfasis decreciente).
- **Sin arcoíris.** Sin gradientes de 5+ colores. El color semántico (rojo = error, verde = success) aparece SOLO cuando tiene significado.

### Layout de Panel KPI

Patrón de Vercel Analytics: lista de métricas, cada una con:

```
Etiqueta (12px label-strong, mayúsculas)
Valor KPI (28px display-md, peso 600, tracking -0.025em)
Pista sutil (14px body-small, gris terciario)
```

Las tarjetas KPI están en **rejilla conectada por hairlines** — cada celda separada por `1px {colors.hairline}` vertical y horizontal.

### Tooltip

- Fondo **oscuro invertido** (casi negro en claro, casi blanco en oscuro).
- Texto **contraste alto**.
- `0 4px 12px rgba(0, 0, 0, 0.12)` sombra suave.

---

## Componentes

### Botones

**`button-primary`** — Acción principal.

- Background `#0070f3`, texto blanco.
- 36px alto × 8px radius.
- Padding 8px vertical × 16px horizontal.
- Peso 500, size 16px.
- Hover: background `#005bd3`.
- Focus: anillo `2px solid #0070f3`.
- Active: `transform: scale(0.95)` (micro-interacción).

**`button-secondary`** — Acción secundaria.

- Background `#f4f4f5`, texto primario, borde `1px #e8e8eb`.
- 36px × 8px radius.
- Hover: background `#e8e8eb`.

**`button-ghost`** — Sin fondo, solo texto.

- Texto primario.
- Hover: background `#f4f4f5`.

**`button-danger`** — Acción destructiva.

- Background `#d6201f`, texto blanco.
- 36px × 8px radius.
- Hover: background más oscuro.

### Inputs

**`input-default`** — Texto, search, etc.

- Background `#ffffff`, borde `1px #e8e8eb`.
- 36px × 8px radius.
- Placeholder: `#52525b` (text-secondary).
- Focus: borde `2px #0070f3` (reemplaza el hairline).
- Texto: 16px body.

**Validación:**

- Error: borde rojo `#d6201f`.
- Success: borde verde `#117a3b`.
- Warning: borde naranja `#ab5300`.

### Selects

Custom (no nativo). Menú 12px radius. Ícono chevron `#52525b`. Hover: background sutil.

### Badges / Píldoras

**`badge-semantic`** (success):

- Background `#dcf5ec`, texto `#117a3b`.
- 12px radius (surface radius).
- Padding 4px × 8px.
- Typography: label-strong (12px, 600, MAYÚS).

**`badge-warning`** / **`badge-danger`**: idem con sus colores semánticos.

**No hay multi-color badges** (avoid cartoonish appearance).

### Tarjetas

**`card-default`** — Panel de contenido.

- Background `#ffffff`, borde `1px #e8e8eb`.
- 12px radius.
- Padding 16px.
- Sin sombra (flat).

**Hover:** background sutil `#f4f4f5` o borde marcado.

### Tabla

- **Header row**: background `#f4f4f5`, texto `#52525b` label-strong.
- **Zebra striping**: filas alternas con background `#f4f4f5`.
- **Hairlines horizontales**: `1px #e8e8eb` entre filas.
- **Sin vertical separators** (grid implícito por padding).
- **Números**: tabulares.

### Modales

- **Overlay**: `rgba(0, 0, 0, 0.45)` (semi-transparente, permite ver detrás).
- **Contenido**: 12px radius, sombra `0 12px 56px rgba(0, 0, 0, 0.15)`.
- **Header**: 24px display-lg, peso 600.
- **Body**: 16px body.
- **Footer**: botón primario alineado derecha.

### Topbar

- Background `#ffffff`, borde inferior `1px #e8e8eb`.
- 56px alto (space para búsqueda/acciones).
- Sticky top.

### Sidebar Flotante

- Background `#ffffff`, borde `1px #e8e8eb`, 12px radius.
- Sombra `0 4px 16px rgba(0, 0, 0, 0.08)` (soft lift).
- Ancho ~280px típico.
- Mantiene su selección activa (highlighting).
- Botón toggle (☰) en top-left o hamburger colapsable.

---

## Do's

✓ Un solo acento azul (`#0070f3`) para TODA interacción — links, botones, anillos de foco, overlays.

✓ Monocromía en data-viz: azul para hoy, gris para comparación. Sin arcoíris.

✓ Hairlines `1px` en tarjetas y divisores. CERO sombras en chrome (solo overlays).

✓ Números tabulares en TODA cifra (`font-variant-numeric: tabular-nums`).

✓ Modo claro y oscuro — ambos deliberados, ninguno heredado. Toggle visible.

✓ Geist Sans 400/500/600. Tracking -0.025em en display sizes (display-md y mayores).

✓ Border radius: 8px en controles, 12px en superficies, círculos en ícono-botones.

✓ Tarjetas planas. Elevación por color + hairline, no por sombra.

✓ Paddings generosos (8px en controles, 16px en tarjetas) — aire respeta el espacio.

✓ KPI: display-md 600 tracking -0.025em line-height 1.

---

## Don'ts

✗ Segundo color de marca (no teal, no naranja, no grayscale "marca"). Azul eléctrico es el único.

✗ Arcoíris en gráficos. Monocromía o semántica.

✗ Cápsulas/pills salvo ícono-botón (full circle es la única excepción).

✗ Sombras de Chrome (drop-shadow, box-shadow pesadas). SOLO overlay.

✗ Fondos de puntitos o texturas (noise, grain) en páginas normales — reservado a sesiones libres/dashboard especiales.

✗ Geist Mono en cifras con miles (8.420€) — Geist Sans tabular es mejor.

✗ Gradientes decorativos. El color habla una vez.

✗ Colores semánticos para énfasis visual (no rojo para botón secundario solo porque "looks good").

✗ Weight 300 o 700 — escalera 400/500/600 es la pista Geist.

✗ Line-height <1.4 en body (aire legible).

---

## Responsive

### Breakpoints Clave

| Breakpoint | Use                                                    |
| ---------- | ------------------------------------------------------ |
| ≤ 768px    | Mobile: sidebar collapsa, topbar se reduce, grid 1-col |
| 769–1024px | Tablet: sidebar lateral, grid 2-col                    |
| ≥ 1025px   | Desktop: sidebar + main content, grid 3–4-col          |

- No overflow. Touch targets ≥ 44px.
- Inputs y botones siempre 36px (cómodos en mobile).

### Dark Mode en Responsive

Oscuro funciona igual en todos los breakpoints — solo cambia la rampa de grises, no la geometría.

---

## Anti-Patrón: "Apple vs Geist"

La anterior referencia (Apple) enfatizaba:

- Cápsulas de botón (full-pill).
- Sombras en producto.
- Fotografía primaria, UI secundaria.
- Luz muy brillante, oscuridad muy profunda (mayor contraste dramatico).

**Geist rechaza todo eso:**

- Rectángulo suave (8px en control, 12px en superficie).
- Plano + hairline.
- Data primaria, UI secundaria.
- Gris neutro frío, no dramático.

Ambos son "premium minimalista", pero Geist es `data-driven` y `grid-based`. Apple era `photography-first`.

---

## Tooling & Implementation

- **Colores:** CSS custom properties en `theme-geist.css`. Light y dark vía `data-theme`.
- **Tipografía:** Geist Sans/Mono vendorizadas. Fallbacks a Inter o system-ui.
- **Componentes:** Button, Input, Badge, Card, Modal, Table — reutilizables, no one-offs.
- **Tests:** Screenshots Playwright en light y dark. Responsive 320/768/1440. Accessibility WCAG AA.

---

## Iteration Checklist

- [ ] ¿Colores de datos? Azul + gris monocromía.
- [ ] ¿Botón? 8px radius, 36px alto, acento azul o secundario.
- [ ] ¿Tarjeta? 12px radius, hairline, sin sombra.
- [ ] ¿Números? Tabulares (`font-variant-numeric: tabular-nums`).
- [ ] ¿KPI importante? display-md 600 tracking -0.025em line-height 1.
- [ ] ¿Dark mode?Rampa 6 niveles, toggle visible.
- [ ] ¿Overlay (modal, dropdown)?Sombra `0 12px 56px rgba(0, 0, 0, 0.15)`.
- [ ] ¿Elevation?Color + hairline, cero sombra en chrome.
- [ ] ¿Responsive?44px touch targets, no overflow.
