import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Key, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

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
    <div className="api-key-reveal">
      <code className="api-key-reveal__code">{visible ? value : '•'.repeat(32)}</code>
      <button
        type="button"
        title={visible ? 'Ocultar' : 'Mostrar'}
        onClick={() => setVisible((v) => !v)}
        className="api-key-reveal__btn"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        title={copied ? '¡Copiado!' : 'Copiar'}
        onClick={copy}
        className="api-key-reveal__btn"
      >
        <Copy size={14} />
        {copied && <span className="api-key-reveal__copied">¡Copiado!</span>}
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
  usePageHeader('API Keys');
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [justCreated, setJustCreated] = useState<{ id: string; key: string } | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

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
      setConfirmRevokeId(null);
    },
  });

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="page-container">
      <div className="page-actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            setShowCreate(true);
            setJustCreated(null);
          }}
        >
          <Plus size={14} />
          Nueva API key
        </button>
      </div>

      {/* Banner con la key recién creada — solo visible una vez */}
      {justCreated && (
        <div className="api-key-banner" data-testid="api-key-banner">
          <Key size={16} />
          <div>
            <strong>Guarda esta key ahora — no se mostrará de nuevo.</strong>
            <RevealKey value={justCreated.key} />
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setJustCreated(null)}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {/* Modal de creación */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Nueva API key</h3>
            <div className="form-field">
              <label htmlFor="apikey-name">Nombre</label>
              <input
                id="apikey-name"
                type="text"
                className="input"
                placeholder="ERP, mayorista externo…"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="apikey-pricelist">
                Tarifa (<span className="form-field__optional">opcional</span>)
              </label>
              <input
                id="apikey-pricelist"
                type="text"
                className="input"
                placeholder="ID de tarifa mayorista"
                value={form.priceListId}
                onChange={(e) => setForm((f) => ({ ...f, priceListId: e.target.value }))}
              />
              <span className="form-field__hint">
                Si se asigna una tarifa, el endpoint /public/stock incluye el precio mayorista.
              </span>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!form.name.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de revocación */}
      {confirmRevokeId && (
        <div className="modal-backdrop" onClick={() => setConfirmRevokeId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Revocar API key</h3>
            <p>Esta acción es irreversible. El acceso externo dejará de funcionar de inmediato.</p>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmRevokeId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={revokeMut.isPending}
                onClick={() => revokeMut.mutate(confirmRevokeId)}
              >
                {revokeMut.isPending ? 'Revocando…' : 'Revocar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted">Cargando…</p>}

      {!isLoading && active.length === 0 && (
        <p className="text-muted">No hay API keys activas. Crea una para dar acceso externo.</p>
      )}

      {active.length > 0 && (
        <table className="data-table" data-testid="api-keys-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Prefijo</th>
              <th>Tarifa</th>
              <th>Creada</th>
              <th>Último uso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {active.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>
                  <code>stpv_{k.prefix}_…</code>
                </td>
                <td>{k.priceListId ?? '—'}</td>
                <td>{fmtDate(k.createdAt)}</td>
                <td>{fmtDate(k.lastUsedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    title="Revocar"
                    onClick={() => setConfirmRevokeId(k.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {revoked.length > 0 && (
        <details className="api-keys-revoked">
          <summary>Revocadas ({revoked.length})</summary>
          <table className="data-table data-table--muted">
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
                  <td>{k.name}</td>
                  <td>
                    <code>stpv_{k.prefix}_…</code>
                  </td>
                  <td>{fmtDate(k.revokedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
