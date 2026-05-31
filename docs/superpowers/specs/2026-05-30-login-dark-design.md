# Login dark-mode con StarField — simpleTPV

**Fecha:** 2026-05-30  
**Alcance:** `packages/ui` (LoginForm + StarField + login.css)  
**Apps afectadas:** `apps/tpv` (sin cambios en código)

## Objetivo

Replicar el diseño de login de Finank en la TPV: layout de dos columnas, panel izquierdo con rejilla canvas animada, panel derecho con formulario dark-theme. La interfaz pública del componente `LoginForm` no cambia.

## Diseño visual

- **Fondo izquierdo:** `#080808`
- **Fondo derecho:** `#0d0d0d`
- **Fuente:** monospace (`font-family: ui-monospace, 'Geist Mono', monospace`)
- **Inputs:** solo `border-bottom`, sin border-radius, sin borde en los lados
- **Botón:** fondo blanco `#ffffff`, texto negro, hover `#f59e0b` (amber)
- **Labels:** mono uppercase, tracking amplio, opacidad 40%
- **Divisor izq/der:** `1px solid rgba(255,255,255,0.06)` con gradiente vertical de brillo central

## Componentes

### `StarField.tsx` (nuevo)

Canvas 100% del panel izquierdo. Comportamiento:

- Rejilla 24×16 nodos con coordenadas distribuidas uniformemente
- Cada nodo pulsa en opacidad (`sin(time * pulseSpeed + pulsePhase)`)
- Aristas horizontales y verticales entre nodos adyacentes
- Al mover el ratón sobre el canvas: nodos y aristas cercanos ganan brillo (radio 120px nodos, 180px aristas)
- `ResizeObserver` reconstruye la rejilla al cambiar el tamaño del contenedor
- **Ticker inferior:** reloj en tiempo real `HH:MM:SS` actualizado cada segundo via `setInterval`
  - Línea 1: `simpleTPV · POS` (mono, uppercase, tracking, opacidad 20%)
  - Línea 2: reloj `HH:MM:SS` (mono tabular-nums, opacidad 20%)

### `LoginForm.tsx` (actualizado)

Mantiene interfaz pública:

```ts
interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  title?: string; // valor por defecto: 'simpleTPV'
  subtitle?: string;
}
```

Layout interno:

- Shell: `min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr`
- En móvil (`< 768px`): `grid-template-columns: 1fr` (panel izquierdo oculto con `display: none`)
- Panel izquierdo: `<StarField />` + borde derecho sutil + gradiente de transición
- Panel derecho: flex column centrado, `max-width: 340px`, padding `1.5rem 3.5rem`

Formulario interior:

- Cabecera: `<h1>` con texto `Bienvenido`, subtítulo en mono uppercase
- Campo email: input `type="email"` con label mono, solo border-bottom
- Campo contraseña: input `type="password"` con label mono, solo border-bottom
- Error: texto rojo mono pequeño, animación fade-in
- Botón `Entrar` / `Entrando…` con spinner (CSS `@keyframes spin` inline)
- Animación de entrada del formulario: `opacity 0→1 + translateY 6px→0` en 220ms

### `login.css` (reemplazado)

CSS vanilla sin Tailwind. Variables:

- `--login-bg-left: #080808`
- `--login-bg-right: #0d0d0d`
- `--login-border: rgba(255,255,255,0.06)`
- `--login-text: #ffffff`
- `--login-text-dim: rgba(255,255,255,0.4)`
- `--login-amber: #f59e0b`

## Flujo de datos

Sin cambios. `App.tsx` en `apps/tpv` sigue siendo:

```tsx
<LoginForm onSubmit={api.login} subtitle="Punto de venta" />
```

El `title` (por defecto `'simpleTPV'`) se usa en el `<title>` accesible del formulario pero el ticker del StarField siempre muestra `simpleTPV · POS` hardcodeado.

## Exportaciones de `packages/ui`

- `StarField` se exporta desde `packages/ui/src/index.ts` (por coherencia, aunque la TPV no lo usa directamente)
- `LoginForm` ya estaba exportado — sin cambio en la export

## Tests

No se añaden tests unitarios para el canvas (difícil de testear con jsdom). El comportamiento visual se verifica arrancando la app y comprobando:

1. Layout dos columnas en pantalla ancha
2. Layout una columna en móvil (panel izquierdo oculto)
3. Reloj actualiza cada segundo
4. Login con credenciales correctas redirige a la app
5. Error se muestra en rojo bajo el formulario

## Archivos afectados

| Archivo                                    | Acción                  |
| ------------------------------------------ | ----------------------- |
| `packages/ui/src/components/StarField.tsx` | Crear                   |
| `packages/ui/src/components/LoginForm.tsx` | Reescribir              |
| `packages/ui/src/styles/login.css`         | Reescribir              |
| `packages/ui/src/index.ts`                 | Añadir export StarField |

## Archivos sin cambios

- `apps/tpv/src/App.tsx`
- `packages/ui/package.json`
- `packages/auth/*`
