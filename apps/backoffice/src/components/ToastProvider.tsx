import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type ShowToast = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TIMEOUT_MS = 4000;

// Proveedor de notificaciones efímeras (toasts) para el feedback de acciones
// (crear/guardar/borrar/revocar). Apiladas abajo a la derecha; se auto-descartan.
// aria-live="polite" para que los lectores de pantalla las anuncien.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const show = useCallback<ShowToast>((message, tone = 'info') => {
    const id = seq.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TIMEOUT_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" data-testid="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} data-testid="toast">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
