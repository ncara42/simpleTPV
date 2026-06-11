import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';

import { useConfirm } from './components/ConfirmProvider.js';
import { Modal } from './components/Modal.js';
import { SectionToolbar } from './components/SectionToolbar.js';
import { useToast } from './components/ToastProvider.js';
import { createApiKey, listApiKeys, revokeApiKey } from './lib/api-keys.js';
import { usePageHeader } from './lib/pageHeader.js';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RevealKey({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="apikey-reveal">
      <code className="apikey-reveal-code">{visible ? value : '•'.repeat(32)}</code>
      <button
        type="button"
        className="link-btn"
        title={visible ? 'Ocultar' : 'Mostrar'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        className="link-btn"
        title={copied ? '¡Copiado!' : 'Copiar'}
        onClick={copy}
      >
        <Copy size={14} />
        {copied ? ' ¡Copiado!' : ''}
      </button>
    </div>
  );
}

interface CreateForm {
  name: string;
  priceListId: string;
}

const EMPTY_FORM: CreateForm = { name: '', priceListId: '' };

export function ApiKeysPage() {
  usePageHeader('API Keys', 'Acceso externo de solo lectura al stock');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [justCreated, setJustCreated] = useState<{ id: string; key: string } | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: listApiKeys,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const input: Parameters<typeof createApiKey>[0] = { name: form.name.trim() };
      if (form.priceListId) input.priceListId = form.priceListId;
      return createApiKey(input);
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      setJustCreated({ id: created.id, key: created.key });
      setShowCreate(false);
      setForm(EMPTY_FORM);
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast('API key revocada', 'success');
    },
    onError: () => toast('No se pudo revocar la API key', 'error'),
  });

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <section className="catalog" data-testid="apikeys-page">
      <div className="table-panel">
        <SectionToolbar
          actionLabel="Nueva API key"
          onAction={() => {
            setShowCreate(true);
            setJustCreated(null);
          }}
          actionTestId="apikey-new"
        >
          <span className="muted">
            {active.length} key{active.length !== 1 ? 's' : ''} activa
            {active.length !== 1 ? 's' : ''}
          </span>
        </SectionToolbar>

        {justCreated && (
          <div className="apikey-banner" data-testid="apikey-banner">
            <KeyRound size={16} />
            <div className="apikey-banner-body">
              <strong>Guarda esta key ahora — no se mostrará de nuevo.</strong>
              <RevealKey value={justCreated.key} />
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => setJustCreated(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : active.length === 0 ? (
          <p className="catalog-empty">
            No hay API keys activas. Crea una para dar acceso externo.
          </p>
        ) : (
          <table className="catalog-table" data-testid="apikeys-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Prefijo</th>
                <th>Tarifa</th>
                <th>Creada</th>
                <th>Último uso</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="muted">
                    <code>stpv_{k.prefix}_…</code>
                  </td>
                  <td className="muted">{k.priceListId ?? '—'}</td>
                  <td className="muted">{fmtDate(k.createdAt)}</td>
                  <td className="muted">{fmtDate(k.lastUsedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Revocar API key',
                          message: `¿Revocar la API key "${k.name}"? El acceso externo dejará de funcionar de inmediato. Es irreversible.`,
                          confirmLabel: 'Revocar',
                          danger: true,
                        });
                        if (ok) revokeMut.mutate(k.id);
                      }}
                    >
                      Revocar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {revoked.length > 0 && (
          <details className="apikey-revoked">
            <summary className="muted">Revocadas ({revoked.length})</summary>
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Prefijo</th>
                  <th>Revocada</th>
                </tr>
              </thead>
              <tbody>
                {revoked.map((k) => (
                  <tr key={k.id}>
                    <td className="muted">{k.name}</td>
                    <td className="muted">
                      <code>stpv_{k.prefix}_…</code>
                    </td>
                    <td className="muted">{fmtDate(k.revokedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {showCreate && (
        <Modal
          onClose={() => setShowCreate(false)}
          className="modal--form"
          testId="apikey-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) createMut.mutate();
          }}
        >
          <header className="modal-head">
            <h3>Nueva API key</h3>
          </header>
          <div className="modal-body">
            <section className="form-section">
              <label>
                Nombre
                <input
                  autoFocus
                  required
                  placeholder="ERP, mayorista externo…"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="apikey-name"
                />
              </label>
              <label>
                Tarifa (opcional)
                <input
                  placeholder="ID de tarifa mayorista"
                  value={form.priceListId}
                  onChange={(e) => setForm((f) => ({ ...f, priceListId: e.target.value }))}
                />
              </label>
              <p className="muted">
                Si se asigna una tarifa, <code>/public/stock</code> incluye el precio mayorista.
              </p>
            </section>
          </div>
          <div className="modal-foot modal-foot-actions">
            <button type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!form.name.trim() || createMut.isPending}
            >
              {createMut.isPending ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
