import { ApiError, type TimeClockType } from '@simpletpv/auth';
import { DataTable } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmModal } from './ConfirmModal.js';
import { fmtHm, formatDuration } from './lib/format.js';
import { createTimeClockEntry, pairDevice, timeClockHistory } from './lib/time-clock.js';
import { useTimeClock } from './lib/useTimeClock.js';

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

// Hora "HH:mm" de un fichaje ISO; guion si no hay (jornada sin salida aún).
function fmtClock(iso: string | null): string {
  return iso ? timeFmt.format(new Date(iso)) : '—';
}

// Día local de hoy (YYYY-MM-DD) para acotar el máximo del filtro de fecha.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TimeClockPanel({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [pendingPunch, setPendingPunch] = useState<'CLOCK_IN' | 'CLOCK_OUT' | null>(null);
  const [dateFilter, setDateFilter] = useState('');

  const { device, authorized, summaryQuery, status, liveWorkedMs } = useTimeClock(storeId);

  usePageHeader('Fichaje', authorized ? (device.data?.device?.name ?? 'Turno') : undefined);

  const historyQuery = useQuery({
    queryKey: ['time-clock-history', storeId, dateFilter],
    queryFn: () =>
      timeClockHistory(storeId as string, dateFilter ? { from: dateFilter, to: dateFilter } : {}),
    enabled: storeId !== null && authorized,
  });

  const pair = useMutation({
    mutationFn: pairDevice,
    onSuccess: () => {
      setToken('');
      void qc.invalidateQueries({ queryKey: ['official-device'] });
    },
  });

  const punch = useMutation({
    mutationFn: (type: TimeClockType) =>
      createTimeClockEntry({
        storeId: storeId as string,
        ...(device.data?.device?.id ? { deviceId: device.data.device.id } : {}),
        type,
      }),
    onSuccess: () => {
      setPendingPunch(null);
      void qc.invalidateQueries({ queryKey: ['time-clock-today', storeId] });
      void qc.invalidateQueries({ queryKey: ['time-clock-history', storeId] });
    },
  });

  if (!authorized) {
    return (
      <div className="time-clock-view" data-testid="time-clock-locked">
        <div className="cash-card">
          <p className="muted">Este dispositivo no está autorizado como TPV oficial.</p>
          <label className="cash-field">
            <span>Token de pairing</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              data-testid="device-token"
            />
          </label>
          <button
            type="button"
            className="time-clock-pair"
            disabled={token.trim().length < 6 || pair.isPending}
            onClick={() => pair.mutate(token.trim().toUpperCase())}
            data-testid="device-pair"
          >
            Autorizar dispositivo
          </button>
          {pair.isError && <p className="cash-error">Token no válido o no autorizado.</p>}
        </div>
      </div>
    );
  }

  const busy = punch.isPending || summaryQuery.isLoading;
  const badge =
    status === 'IN' ? 'Fichado' : status === 'BREAK' ? 'En pausa' : 'Sin fichaje activo';
  const punchError =
    punch.error instanceof ApiError ? (punch.error.body ?? 'No se pudo fichar.') : null;
  const rows = historyQuery.data ?? [];

  return (
    <div className="time-clock-view" data-testid="time-clock-view">
      <div className="time-clock-bar">
        <div className="time-clock-bar-state">
          <span
            className={`cash-card-badge time-clock-badge time-clock-badge--${status.toLowerCase()}`}
            data-testid="time-clock-state"
          >
            {badge}
          </span>
          {status !== 'OUT' && (
            <span className="time-clock-counter tabular-nums" data-testid="time-clock-counter">
              {formatDuration(liveWorkedMs)}
            </span>
          )}
        </div>

        <div className="time-clock-actions">
          {status === 'OUT' && (
            <button
              type="button"
              className="time-clock-in"
              onClick={() => setPendingPunch('CLOCK_IN')}
              disabled={busy || storeId === null}
              data-testid="time-clock-clock-in"
            >
              Fichar entrada
            </button>
          )}
          {status === 'IN' && (
            <>
              <button
                type="button"
                className="time-clock-break"
                onClick={() => punch.mutate('BREAK_START')}
                disabled={busy}
                data-testid="time-clock-break-start"
              >
                Iniciar pausa
              </button>
              <button
                type="button"
                className="time-clock-out"
                onClick={() => setPendingPunch('CLOCK_OUT')}
                disabled={busy}
                data-testid="time-clock-clock-out"
              >
                Fichar salida
              </button>
            </>
          )}
          {status === 'BREAK' && (
            <>
              <button
                type="button"
                className="time-clock-break"
                onClick={() => punch.mutate('BREAK_END')}
                disabled={busy}
                data-testid="time-clock-break-end"
              >
                Terminar pausa
              </button>
              <button
                type="button"
                className="time-clock-out"
                onClick={() => setPendingPunch('CLOCK_OUT')}
                disabled={busy}
                data-testid="time-clock-clock-out"
              >
                Fichar salida
              </button>
            </>
          )}
        </div>
      </div>

      {punchError && (
        <p className="cash-error" data-testid="time-clock-error">
          {punchError}
        </p>
      )}

      <div className="table-panel">
        <div className="users-toolbar">
          <div className="sales-filters">
            <input
              type="date"
              className="catalog-search"
              value={dateFilter}
              max={todayKey()}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filtrar por fecha"
              data-testid="time-clock-date"
            />
            {dateFilter && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setDateFilter('')}
                data-testid="time-clock-date-clear"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <DataTable
          data-testid="time-clock-table"
          rowTestId="time-clock-row"
          rows={rows}
          rowKey={(row) => row.date}
          loading={historyQuery.isLoading}
          emptyState={
            <span className="catalog-empty" data-testid="time-clock-empty">
              Sin fichajes para la fecha seleccionada.
            </span>
          }
          columns={[
            {
              key: 'date',
              header: 'Fecha',
              render: (row) => <span className="muted tabular-nums">{row.date}</span>,
            },
            {
              key: 'firstIn',
              header: 'Entrada',
              render: (row) => <span className="muted tabular-nums">{fmtClock(row.firstIn)}</span>,
            },
            {
              key: 'lastOut',
              header: 'Salida',
              render: (row) => <span className="muted tabular-nums">{fmtClock(row.lastOut)}</span>,
            },
            {
              key: 'breakMs',
              header: 'Pausas',
              render: (row) => <span className="muted tabular-nums">{fmtHm(row.breakMs)}</span>,
            },
            {
              key: 'workedMs',
              header: 'Horas',
              render: (row) => <span className="tabular-nums">{fmtHm(row.workedMs)}</span>,
            },
          ]}
        />
      </div>

      {pendingPunch && (
        <ConfirmModal
          testId="time-clock"
          title={pendingPunch === 'CLOCK_IN' ? '¿Iniciar jornada?' : '¿Terminar jornada?'}
          message={
            pendingPunch === 'CLOCK_IN'
              ? 'Vas a fichar tu entrada.'
              : 'Vas a fichar tu salida y cerrar el turno.'
          }
          confirmLabel={pendingPunch === 'CLOCK_IN' ? 'Fichar entrada' : 'Fichar salida'}
          busy={punch.isPending}
          onConfirm={() => punch.mutate(pendingPunch)}
          onCancel={() => setPendingPunch(null)}
        />
      )}
    </div>
  );
}
