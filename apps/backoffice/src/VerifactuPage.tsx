import type { VerifactuStatus } from '@simpletpv/auth';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listVerifactu, retryVerifactu } from './lib/verifactu.js';

const STATUS_LABEL: Record<VerifactuStatus, string> = {
  PENDING: 'Pendiente',
  SENT: 'Enviado',
  FAILED: 'Fallido',
};
const STATUS_CLASS: Record<VerifactuStatus, string> = {
  PENDING: 'stock-yellow',
  SENT: 'stock-green',
  FAILED: 'stock-red',
};
const dt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export function VerifactuPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'' | VerifactuStatus>('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['verifactu', filter],
    queryFn: () => listVerifactu(filter || undefined),
    placeholderData: keepPreviousData,
    // Refresco ligero: el envío es asíncrono (cola), así que poll cada 5s.
    refetchInterval: 5000,
  });
  const { data: allRecords = [] } = useQuery({
    queryKey: ['verifactu', ''],
    queryFn: () => listVerifactu(),
    refetchInterval: 5000,
  });

  const retryMut = useMutation({
    mutationFn: retryVerifactu,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['verifactu'] }),
  });

  const pending = allRecords.filter((r) => r.status === 'PENDING').length;
  const failed = allRecords.filter((r) => r.status === 'FAILED').length;

  return (
    <section className="catalog" data-testid="verifactu-page">
      <header className="catalog-head">
        <h2>Salud VeriFactu</h2>
        <div className="catalog-actions">
          <span className="stock-tag stock-yellow" data-testid="vf-pending-count">
            {pending} pendientes
          </span>
          <span className="stock-tag stock-red" data-testid="vf-failed-count">
            {failed} fallidos
          </span>
          <select
            className="catalog-search"
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | VerifactuStatus)}
            data-testid="vf-filter"
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendientes</option>
            <option value="SENT">Enviados</option>
            <option value="FAILED">Fallidos</option>
          </select>
        </div>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : records.length === 0 ? (
        <p className="catalog-empty" data-testid="vf-empty">
          Sin registros.
        </p>
      ) : (
        <table className="catalog-table" data-testid="vf-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Intentos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} data-testid="vf-row">
                <td className="muted">{dt.format(new Date(r.createdAt))}</td>
                <td>{r.type}</td>
                <td>
                  <span className={`stock-tag ${STATUS_CLASS[r.status]}`} data-testid="vf-status">
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.lastError && <span className="muted"> · {r.lastError}</span>}
                </td>
                <td className="muted">{r.attempts}</td>
                <td>
                  {r.status === 'FAILED' && (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={retryMut.isPending}
                      onClick={() => retryMut.mutate(r.id)}
                      data-testid="vf-retry"
                    >
                      Reintentar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
