import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  initialEmail?: string;
  initialPassword?: string;
}

function EyeReveal({ open }: { open: boolean }) {
  return (
    <svg
      key={String(open)}
      className={`eye-icon${open ? ' eye-icon--open' : ' eye-icon--closed'}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="eye-lids">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle className="eye-pupil" cx="12" cy="12" r="3" />
        <circle
          className="eye-glint"
          cx="13.4"
          cy="10.6"
          r="0.75"
          fill="currentColor"
          stroke="none"
        />
      </g>
      <line className="eye-slash" x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function LoginForm({ onSubmit, initialEmail = '', initialPassword = '' }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // El halo de marca sigue al puntero (suavizado vía transición CSS).
  // Se desactiva en táctil y bajo prefers-reduced-motion.
  const shellRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const staticBgRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const sync = (): void => {
      staticBgRef.current = reduced.matches || coarse.matches;
    };
    sync();
    reduced.addEventListener('change', sync);
    coarse.addEventListener('change', sync);
    return () => {
      reduced.removeEventListener('change', sync);
      coarse.removeEventListener('change', sync);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handlePointerMove(e: ReactMouseEvent<HTMLDivElement>): void {
    if (staticBgRef.current || rafRef.current !== null) return;
    const el = shellRef.current;
    if (!el) return;
    const { clientX, clientY } = e;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--login-px', ((clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty('--login-py', ((clientY - r.top) / r.height - 0.5).toFixed(3));
    });
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    if (loading) return;
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div className="login-shell" ref={shellRef} onMouseMove={handlePointerMove}>
      {/* Panel izquierdo — marca */}
      <aside className="login-brand">
        {/* Fondo: precisión, no decoración — rejilla técnica, halo de
            marca anclado y grano fino. Sin constelaciones ni haces. */}
        <div className="login-brand-grid" aria-hidden="true" />
        <div className="login-brand-bloom" aria-hidden="true" />
        <div className="login-brand-grain" aria-hidden="true" />

        <div className="login-brand-logo">
          <span className="login-brand-name">qrush</span>
          <span className="login-brand-suffix">retail</span>
        </div>

        <div className="login-brand-copy">
          <span className="login-brand-eyebrow">Plataforma de gestión</span>
          <h2 className="login-brand-title">
            Todo tu retail,
            <br />
            en un solo lugar.
          </h2>
          <p className="login-brand-text">
            Ventas, inventario, equipo y analítica, sincronizados en tiempo real entre todas tus
            tiendas.
          </p>
        </div>
      </aside>

      {/* Panel derecho — formulario */}
      <main className="login-panel">
        <form onSubmit={handleSubmit} className="login-form" noValidate data-testid="login-card">
          <div className="login-heading">
            <h1 className="login-title">Bienvenido de nuevo</h1>
            <p className="login-subtitle">Tu negocio al completo, desde aquí.</p>
          </div>

          <label className="login-field">
            <span className="login-label">Usuario</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              className={`login-input${error ? ' login-input--error' : ''}`}
              data-testid="login-email"
              disabled={loading}
            />
          </label>

          <label className="login-field">
            <span className="login-label">Contraseña</span>
            <div className="login-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className={`login-input login-input--password${error ? ' login-input--error' : ''}`}
                data-testid="login-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-reveal"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <EyeReveal open={showPassword} />
              </button>
            </div>
          </label>

          {error && (
            <p className="login-error" role="alert" data-testid="login-error">
              {error}
            </p>
          )}

          <div className="login-options">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Recordar sesión</span>
            </label>
            <a className="login-forgot" href="#">
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-submit"
            data-testid="login-submit"
          >
            {loading ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                <span className="login-sr-only">Iniciando sesión…</span>
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>

          <p className="login-footnote">
            ¿Problemas para acceder? <span>Contacta con tu administrador</span>
          </p>
        </form>
      </main>
    </div>
  );
}
