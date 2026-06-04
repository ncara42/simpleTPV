import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { StarField } from './StarField.js';

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  title?: string;
  subtitle?: string;
  leftPanel?: ReactNode;
}

export function LoginForm({ onSubmit, title = 'simpleTPV', subtitle, leftPanel }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      {/* Panel izquierdo — rejilla animada */}
      <div className="login-left">
        <div className="login-left-glow" />
        {leftPanel ?? <StarField />}
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
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
                {loading ? (
                  <>
                    <span className="login-spinner" aria-hidden="true" />
                    <span
                      style={{
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        overflow: 'hidden',
                        clip: 'rect(0,0,0,0)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Entrando…
                    </span>
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
