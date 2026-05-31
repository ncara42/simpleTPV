# Login dark-mode con StarField — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el login light-theme de la TPV por un diseño dark de dos columnas con panel izquierdo animado (rejilla canvas + ticker) y formulario derecho estilo Finank.

**Architecture:** El componente `LoginForm` en `packages/ui` absorbe todo el layout (shell dos columnas, `StarField`, formulario). La interfaz pública `LoginFormProps` no cambia. `apps/tpv/src/App.tsx` no se toca.

**Tech Stack:** React 19, CSS vanilla (sin Tailwind en `packages/ui`), canvas API, ResizeObserver, setInterval.

---

## Mapa de archivos

| Archivo                                    | Acción                  |
| ------------------------------------------ | ----------------------- |
| `packages/ui/src/components/StarField.tsx` | Crear                   |
| `packages/ui/src/components/LoginForm.tsx` | Reescribir              |
| `packages/ui/src/styles/login.css`         | Reescribir              |
| `packages/ui/src/index.ts`                 | Añadir export StarField |

---

### Tarea 1: CSS dark-theme

**Archivos:**

- Modificar: `packages/ui/src/styles/login.css`

- [ ] **Paso 1: Reemplazar login.css con el dark theme**

Contenido completo del nuevo archivo:

```css
/* ─── Shell ──────────────────────────────────────────────── */
.login-shell {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  background: #080808;
  font-family: ui-monospace, 'Geist Mono', 'Cascadia Code', monospace;
  -webkit-font-smoothing: antialiased;
}

@media (max-width: 767px) {
  .login-shell {
    grid-template-columns: 1fr;
  }
}

/* ─── Panel izquierdo ─────────────────────────────────────── */
.login-left {
  position: relative;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

@media (max-width: 767px) {
  .login-left {
    display: none;
  }
}

/* Gradiente vertical sobre el borde divisor — efecto brillo central */
.login-left-glow {
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(255, 255, 255, 0.14) 50%,
    transparent 100%
  );
}

/* ─── Panel derecho ───────────────────────────────────────── */
.login-right {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem 3.5rem;
  background: #0d0d0d;
}

/* Vignette lateral izquierda — suaviza transición con el panel izq */
.login-right-vignette {
  pointer-events: none;
  position: absolute;
  inset-block: 0;
  left: 0;
  width: 6rem;
  background: linear-gradient(to right, rgba(8, 8, 8, 0.4), transparent);
}

.login-form-wrap {
  position: relative;
  width: 100%;
  max-width: 340px;
}

/* ─── Cabecera del formulario ─────────────────────────────── */
.login-heading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1.75rem;
}

.login-title {
  font-size: 1.5rem;
  font-weight: 300;
  letter-spacing: -0.02em;
  color: #ffffff;
  margin: 0;
  line-height: 1.2;
}

.login-subtitle {
  font-family: ui-monospace, 'Geist Mono', monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.35);
  margin: 0;
}

/* ─── Formulario ──────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  animation: login-rise 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes login-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.login-fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.login-label {
  font-family: ui-monospace, 'Geist Mono', monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.4);
}

.login-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0;
  padding-bottom: 0.625rem;
  font-family: ui-monospace, 'Geist Mono', monospace;
  font-size: 0.875rem;
  color: #ffffff;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}

.login-input::placeholder {
  color: rgba(255, 255, 255, 0.2);
}

.login-input:focus {
  border-bottom-color: rgba(255, 255, 255, 0.7);
}

.login-input--error {
  border-bottom-color: rgba(239, 68, 68, 0.6);
}

/* ─── Error ───────────────────────────────────────────────── */
.login-error {
  font-family: ui-monospace, 'Geist Mono', monospace;
  font-size: 0.625rem;
  color: rgba(248, 113, 113, 0.8);
  margin: 0;
  animation: login-rise 0.15s ease both;
}

/* ─── Botón ───────────────────────────────────────────────── */
.login-actions {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.login-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.75rem;
  background: #ffffff;
  color: #000000;
  border: none;
  border-radius: 0;
  font-family: ui-monospace, 'Geist Mono', monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: background-color 0.2s;
}

.login-submit:hover:not(:disabled) {
  background: #f59e0b;
}

.login-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Spinner para estado loading */
.login-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 1.5px solid rgba(0, 0, 0, 0.3);
  border-top-color: #000000;
  border-radius: 50%;
  animation: login-spin 0.6s linear infinite;
}

@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Paso 2: Verificar que el archivo tiene el contenido correcto**

```bash
head -5 packages/ui/src/styles/login.css
```

Resultado esperado: `/* ─── Shell ───...` en la primera línea con comentario.

---

### Tarea 2: Componente StarField

**Archivos:**

- Crear: `packages/ui/src/components/StarField.tsx`

- [ ] **Paso 1: Crear StarField.tsx**

```tsx
import { useEffect, useRef } from 'react';

interface GridNode {
  x: number;
  y: number;
  baseOpacity: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLS = 24;
    const ROWS = 16;
    let nodes: GridNode[] = [];
    let animId: number;
    let lastTs = 0;
    let time = 0;

    function buildGrid(w: number, h: number) {
      nodes = [];
      const cellW = w / (COLS - 1);
      const cellH = h / (ROWS - 1);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          nodes.push({
            x: c * cellW,
            y: r * cellH,
            baseOpacity: 0.06 + Math.random() * 0.1,
            pulsePhase: Math.random() * Math.PI * 2,
            pulseSpeed: 0.3 + Math.random() * 0.5,
          });
        }
      }
    }

    function draw(ts = 0) {
      if (!canvas || !ctx) return;
      const delta = lastTs ? (ts - lastTs) / 1000 : 0.016;
      lastTs = ts;
      time += delta;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Aristas
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const edgeAlpha =
          n.baseOpacity * (0.5 + 0.5 * Math.sin(time * n.pulseSpeed + n.pulsePhase));

        // Arista derecha
        if (col < COLS - 1) {
          const next = nodes[i + 1];
          const midX = (n.x + next.x) / 2;
          const midY = (n.y + next.y) / 2;
          const hover = Math.max(0, 1 - Math.hypot(midX - mx, midY - my) / 180) * 0.18;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255,255,255,${(edgeAlpha + hover).toFixed(3)})`;
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
        }

        // Arista inferior
        if (row < ROWS - 1) {
          const below = nodes[i + COLS];
          const midX = (n.x + below.x) / 2;
          const midY = (n.y + below.y) / 2;
          const hover = Math.max(0, 1 - Math.hypot(midX - mx, midY - my) / 180) * 0.18;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255,255,255,${(edgeAlpha + hover).toFixed(3)})`;
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(below.x, below.y);
          ctx.stroke();
        }
      }

      // Nodos
      for (const n of nodes) {
        const dist = Math.hypot(n.x - mx, n.y - my);
        const hover = Math.max(0, 1 - dist / 120) * 0.5;
        const alpha = Math.max(
          0.04,
          n.baseOpacity * (0.5 + 0.5 * Math.sin(time * n.pulseSpeed + n.pulsePhase)) + hover,
        );
        const radius = 1 + hover * 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas) return;
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      cancelAnimationFrame(animId);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      buildGrid(canvas.width, canvas.height);
      lastTs = 0;
      animId = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMouseLeave() {
      mouseRef.current = { x: -9999, y: -9999 };
    }
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  // Ticker: reloj en tiempo real
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    const update = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '2rem',
          left: '2rem',
          right: '2rem',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.625rem',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.2)',
            }}
          >
            simpleTPV
          </span>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.625rem',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.15)',
            }}
          >
            Punto de venta · POS
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            ref={tickerRef}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.6875rem',
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(255,255,255,0.2)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Verificar que TypeScript no da errores**

```bash
cd packages/ui && pnpm typecheck
```

Resultado esperado: sin errores.

---

### Tarea 3: Reescribir LoginForm

**Archivos:**

- Modificar: `packages/ui/src/components/LoginForm.tsx`

- [ ] **Paso 1: Reescribir LoginForm.tsx**

```tsx
import * as React from 'react';
import { StarField } from './StarField.js';

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  title?: string;
  subtitle?: string;
}

export function LoginForm({ onSubmit, title = 'simpleTPV', subtitle }: LoginFormProps) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      {/* Panel izquierdo — rejilla animada */}
      <div className="login-left">
        <div className="login-left-glow" />
        <StarField />
      </div>

      {/* Panel derecho — formulario */}
      <div className="login-right">
        <div className="login-right-vignette" />
        <div className="login-form-wrap">
          <form onSubmit={handleSubmit} className="login-form" noValidate data-testid="login-card">
            <div className="login-heading">
              <h1 className="login-title">{title}</h1>
              {subtitle && <p className="login-subtitle">{subtitle}</p>}
            </div>

            <div className="login-fields">
              <label className="login-field">
                <span className="login-label">Correo electrónico</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className={`login-input${error ? ' login-input--error' : ''}`}
                  placeholder="tu@correo.com"
                  data-testid="login-email"
                  disabled={loading}
                />
              </label>

              <label className="login-field">
                <span className="login-label">Contraseña</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  placeholder="••••••••"
                  data-testid="login-password"
                  disabled={loading}
                />
              </label>
            </div>

            {error && (
              <p className="login-error" role="alert" data-testid="login-error">
                {error}
              </p>
            )}

            <div className="login-actions">
              <button
                type="submit"
                disabled={loading}
                className="login-submit"
                data-testid="login-submit"
              >
                {loading ? <span className="login-spinner" aria-hidden="true" /> : 'Entrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Typecheck**

```bash
cd packages/ui && pnpm typecheck
```

Resultado esperado: sin errores.

---

### Tarea 4: Exportar StarField desde el índice

**Archivos:**

- Modificar: `packages/ui/src/index.ts`

- [ ] **Paso 1: Añadir la export de StarField**

Contenido final de `packages/ui/src/index.ts`:

```ts
export { Badge } from './components/Badge.js';
export { Button } from './components/Button.js';
export { Input } from './components/Input.js';
export { LoginForm, type LoginFormProps } from './components/LoginForm.js';
export { StarField } from './components/StarField.js';
export { cn } from './lib/cn.js';
```

- [ ] **Paso 2: Typecheck del monorepo**

```bash
pnpm typecheck
```

Resultado esperado: sin errores en ningún workspace.

---

### Tarea 5: Verificación visual y commit

- [ ] **Paso 1: Arrancar la app TPV**

```bash
pnpm --filter @simpletpv/tpv dev
```

Abrir `http://localhost:5173` (o el puerto que Vite asigne). Verificar:

1. Layout dos columnas — panel izquierdo oscuro con rejilla animada, panel derecho con formulario
2. El ticker inferior izquierdo muestra `simpleTPV` / `Punto de venta · POS` y el reloj actualiza cada segundo
3. Mover el ratón sobre el panel izquierdo: nodos y aristas cercanos brillan
4. En ventana estrecha (< 768px): el panel izquierdo desaparece, solo queda el formulario
5. Introducir credenciales incorrectas: el error aparece en rojo bajo los campos
6. Login correcto: redirige a la pantalla principal de la TPV

- [ ] **Paso 2: Ejecutar tests**

```bash
pnpm test
```

Resultado esperado: todos los tests pasan (los tests de `LoginForm` existentes pueden necesitar ajuste — ver nota abajo).

> **Nota:** Si hay tests de `LoginForm` que buscan `data-testid="login-card"` en un contenedor `div` externo, ahora ese atributo está en el `<form>`. Ajustar el selector si falla.

- [ ] **Paso 3: Commit**

```bash
git add packages/ui/src/components/StarField.tsx \
        packages/ui/src/components/LoginForm.tsx \
        packages/ui/src/styles/login.css \
        packages/ui/src/index.ts
git commit -m "feat(ui): login dark-mode con StarField de dos columnas"
```

---

## Auto-revisión del plan

**Cobertura de la spec:**

- ✅ Shell grid 2 columnas con media query a 1 columna en móvil
- ✅ StarField: 24×16 nodos, aristas, pulso, hover ratón, ResizeObserver
- ✅ Ticker: reloj `HH:MM:SS` + labels `simpleTPV` y `Punto de venta · POS`
- ✅ Formulario: email + password, border-bottom, mono, error rojo, botón blanco hover amber
- ✅ Animación entrada formulario 220ms
- ✅ Interfaz pública `LoginFormProps` intacta
- ✅ `StarField` exportado desde `packages/ui/src/index.ts`
- ✅ `apps/tpv/src/App.tsx` sin cambios

**Placeholders:** ninguno.

**Consistencia de tipos:** `LoginFormProps` definido en Tarea 3, referenciado en el mismo archivo. `StarField` definido en Tarea 2, importado en Tarea 3, exportado en Tarea 4. Todo consistente.
