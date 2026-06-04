import { type FormEvent, useEffect, useRef, useState } from 'react';

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="login-shell">
      {/* Panel izquierdo — marca */}
      <aside className="login-brand">
        <div className="login-brand-glow" aria-hidden="true" />
        <div className="login-brand-orb" aria-hidden="true" />

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
            <p className="login-subtitle">Introduce tus credenciales para continuar.</p>
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
                {showPassword ? 'Ocultar' : 'Mostrar'}
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
