import { type FormEvent, useEffect, useRef, useState } from 'react';

import { useBrandMesh } from '../hooks/use-brand-mesh.js';

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  initialEmail?: string;
  initialPassword?: string;
}

// Validación local previa al envío (idéntica al diseño Login.dc): formato de
// correo y longitud mínima de contraseña. Ahorra un viaje al servidor para
// errores triviales; el error de credenciales real llega del `onSubmit`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// ── Iconos en línea (SVG decorativos, sin dependencia de librería) ──────────
function MailIcon() {
  return (
    <svg
      className="login-input-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="login-input-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ slashed }: { slashed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {slashed && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function LoginForm({ onSubmit, initialEmail = '', initialPassword = '' }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [serverErr, setServerErr] = useState('');

  // Panel de marca: malla animada en <canvas> (se aparta del puntero, respeta
  // prefers-reduced-motion y se limpia sola).
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useBrandMesh(canvasRef);

  // Evita el set de estado en el `finally` si el login tuvo éxito y App ya
  // desmontó el formulario (el accessToken cambió → render de Home).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  function validate(): boolean {
    const mail = email.trim();
    let mailErr = '';
    let pwErr = '';
    if (!mail) mailErr = 'Introduce tu correo electrónico.';
    else if (!EMAIL_RE.test(mail)) mailErr = 'Introduce un correo electrónico válido.';
    if (!password) pwErr = 'Introduce tu contraseña.';
    else if (password.length < MIN_PASSWORD_LENGTH)
      pwErr = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    setEmailErr(mailErr);
    setPasswordErr(pwErr);
    return !mailErr && !pwErr;
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setServerErr('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
      // En caso de éxito no pintamos pantalla de «acceso concedido»: el
      // accessToken cambia y App deja de renderizar este formulario.
    } catch (err) {
      setServerErr(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  return (
    <div className="login-root">
      {/* Panel de marca (izquierda) — oculto en ≤880px */}
      <aside className="login-brand">
        <canvas ref={canvasRef} className="login-brand-mesh" aria-hidden="true" />
        <div className="login-brand-inner">
          <div className="login-brand-head">
            <span className="login-brand-wordmark">SimpleTPV</span>
          </div>
          <div className="login-brand-message">
            <span className="login-brand-rule" aria-hidden="true" />
            <blockquote className="login-brand-quote">
              Centralizamos catálogo, inventario y pedidos B2B en una sola herramienta. Cerramos
              cada mes cuadrado y sin hojas de cálculo.
            </blockquote>
          </div>
        </div>
      </aside>

      {/* Panel del formulario (derecha) */}
      <section className="login-formpanel">
        <div className="login-card" data-testid="login-card">
          {/* Logo solo visible cuando el panel de marca se oculta (móvil) */}
          <div className="login-card-logo">
            <span className="login-card-logo-mark">
              <BrandMark />
            </span>
            <span className="login-card-logo-name">SimpleTPV</span>
          </div>

          <h1 className="login-title">Inicia sesión</h1>
          <p className="login-subtitle">Introduce tus credenciales para acceder al backoffice.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="login-email-input">
                Correo electrónico
              </label>
              <span className="login-input-wrap">
                <MailIcon />
                <input
                  id="login-email-input"
                  className="login-input"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailErr('');
                    setServerErr('');
                  }}
                  data-testid="login-email"
                  data-err={emailErr ? '1' : '0'}
                  aria-invalid={emailErr ? true : undefined}
                  aria-describedby={emailErr ? 'login-email-error' : undefined}
                  disabled={submitting}
                />
              </span>
              {emailErr && (
                <p className="login-field-error" id="login-email-error">
                  <AlertIcon />
                  {emailErr}
                </p>
              )}
            </div>

            <div className="login-field">
              <div className="login-label-row">
                <label className="login-label" htmlFor="login-password-input">
                  Contraseña
                </label>
                <button type="button" className="login-link">
                  La olvidé
                </button>
              </div>
              <span className="login-input-wrap">
                <LockIcon />
                <input
                  id="login-password-input"
                  className="login-input login-input--password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordErr('');
                    setServerErr('');
                  }}
                  data-testid="login-password"
                  data-err={passwordErr ? '1' : '0'}
                  aria-invalid={passwordErr ? true : undefined}
                  aria-describedby={passwordErr ? 'login-password-error' : undefined}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <EyeIcon slashed={showPassword} />
                </button>
              </span>
              {passwordErr && (
                <p className="login-field-error" id="login-password-error">
                  <AlertIcon />
                  {passwordErr}
                </p>
              )}
            </div>

            {serverErr && (
              <p
                className="login-field-error login-server-error"
                role="alert"
                data-testid="login-error"
              >
                <AlertIcon />
                {serverErr}
              </p>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={submitting}
              data-testid="login-submit"
            >
              {submitting && <span className="login-spinner" aria-hidden="true" />}
              {submitting ? 'Comprobando…' : 'Iniciar sesión'}
              {!submitting && <ArrowIcon />}
            </button>
          </form>

          <p className="login-footnote">
            ¿Necesitas una cuenta?{' '}
            <button type="button" className="login-link">
              Solicita acceso
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
