import * as React from 'react';

import { cn } from '../lib/cn.js';

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
      <div className="login-card" data-testid="login-card">
        <div className="login-brand">
          <span className="login-mark" aria-hidden>
            ◆
          </span>
          <h1 className="login-title">{title}</h1>
          {subtitle && <p className="login-subtitle">{subtitle}</p>}
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <label className="login-field">
            <span className="login-label">Correo</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              placeholder="tu@correo.com"
              data-testid="login-email"
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
            />
          </label>

          {error && (
            <p className="login-error" role="alert" data-testid="login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn('login-submit', loading && 'is-loading')}
            data-testid="login-submit"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
