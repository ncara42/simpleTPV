import { ConflictException } from '@nestjs/common';
import type { TimeClockType } from '@simpletpv/db';

// Estado de la jornada de un empleado, derivado de la secuencia de fichajes.
export type TimeClockStatus = 'OUT' | 'IN' | 'BREAK';

// Máquina de estados del control horario:
//   OUT --CLOCK_IN--> IN --BREAK_START--> BREAK --BREAK_END--> IN --CLOCK_OUT--> OUT
// Devuelve el estado siguiente para una transición válida, o null si es inválida.
function transition(status: TimeClockStatus, type: TimeClockType): TimeClockStatus | null {
  switch (type) {
    case 'CLOCK_IN':
      return status === 'OUT' ? 'IN' : null;
    case 'BREAK_START':
      return status === 'IN' ? 'BREAK' : null;
    case 'BREAK_END':
      return status === 'BREAK' ? 'IN' : null;
    case 'CLOCK_OUT':
      return status === 'IN' || status === 'BREAK' ? 'OUT' : null;
    default:
      return null;
  }
}

// Mensaje claro (castellano) para una transición inválida.
function invalidMessage(status: TimeClockStatus, type: TimeClockType): string {
  switch (type) {
    case 'CLOCK_IN':
      return 'Ya tienes un fichaje de entrada activo';
    case 'CLOCK_OUT':
      return 'No tienes ningún fichaje activo';
    case 'BREAK_START':
      return status === 'BREAK'
        ? 'Ya estás en una pausa'
        : 'Debes fichar entrada antes de iniciar una pausa';
    case 'BREAK_END':
      return 'No tienes ninguna pausa activa';
    default:
      return 'Fichaje no válido';
  }
}

/**
 * Valida la transición y devuelve el estado resultante. Lanza ConflictException
 * (409) con un mensaje claro si la transición es inválida.
 */
export function nextStateOrThrow(status: TimeClockStatus, type: TimeClockType): TimeClockStatus {
  const next = transition(status, type);
  if (next === null) {
    throw new ConflictException(invalidMessage(status, type));
  }
  return next;
}

/**
 * Estado actual a partir del ÚLTIMO fichaje. Como cada evento transiciona a un
 * estado único, el último evento determina el estado sin recorrer todo el día.
 */
export function statusFromLastType(type: TimeClockType | null | undefined): TimeClockStatus {
  switch (type) {
    case 'CLOCK_IN':
    case 'BREAK_END':
      return 'IN';
    case 'BREAK_START':
      return 'BREAK';
    default:
      // CLOCK_OUT o sin fichajes.
      return 'OUT';
  }
}

/** Estado al final de una secuencia completa de eventos (orden ascendente). */
export function deriveStatus(entries: ReadonlyArray<{ type: TimeClockType }>): TimeClockStatus {
  let status: TimeClockStatus = 'OUT';
  for (const e of entries) {
    status = transition(status, e.type) ?? status;
  }
  return status;
}

function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export interface WorkedTotals {
  // ms trabajados en segmentos YA cerrados (excluye el segmento IN en curso).
  workedMs: number;
  // ms en pausa (incluye una pausa en curso cerrada contra `now`).
  breakMs: number;
  // ISO del inicio del segmento IN en curso; el cliente cuenta en vivo desde aquí.
  // null si no está fichado (OUT o en pausa).
  runningSince: string | null;
}

/**
 * Reparte la secuencia de fichajes en tiempo trabajado y tiempo en pausa.
 * El segmento de trabajo en curso NO se suma a workedMs: se devuelve su inicio en
 * `runningSince` para que el cliente lo cuente en vivo (workedMs + (ahora - runningSince)).
 * Eventos inconsistentes (no deberían existir: se valida al insertar) se ignoran.
 */
export function computeWorked(
  entries: ReadonlyArray<{ type: TimeClockType; createdAt: Date | string }>,
  now: Date | string,
): WorkedTotals {
  const nowMs = toMs(now);
  let status: TimeClockStatus = 'OUT';
  let segStart: number | null = null; // inicio del segmento IN abierto
  let breakStart: number | null = null; // inicio de la pausa abierta
  let workedMs = 0;
  let breakMs = 0;

  for (const e of entries) {
    const next = transition(status, e.type);
    if (next === null) continue;
    const t = toMs(e.createdAt);
    switch (e.type) {
      case 'CLOCK_IN':
        segStart = t;
        break;
      case 'BREAK_START':
        if (segStart !== null) workedMs += t - segStart;
        segStart = null;
        breakStart = t;
        break;
      case 'BREAK_END':
        if (breakStart !== null) breakMs += t - breakStart;
        breakStart = null;
        segStart = t;
        break;
      case 'CLOCK_OUT':
        if (segStart !== null) workedMs += t - segStart;
        if (breakStart !== null) breakMs += t - breakStart;
        segStart = null;
        breakStart = null;
        break;
    }
    status = next;
  }

  let runningSince: string | null = null;
  if (status === 'IN' && segStart !== null) {
    runningSince = new Date(segStart).toISOString();
  } else if (status === 'BREAK' && breakStart !== null) {
    breakMs += nowMs - breakStart;
  }

  return { workedMs, breakMs, runningSince };
}

/** Total trabajado incluyendo el segmento en curso (para reportes/historial). */
export function totalWorkedMs(totals: WorkedTotals, now: Date | string): number {
  if (!totals.runningSince) return totals.workedMs;
  return totals.workedMs + (toMs(now) - toMs(totals.runningSince));
}

/** Inicio del día local (00:00) de una fecha dada. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fin del día local (23:59:59.999) de una fecha dada. */
export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Clave de día local YYYY-MM-DD (para agrupar el historial por jornada). */
export function localDayKey(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
