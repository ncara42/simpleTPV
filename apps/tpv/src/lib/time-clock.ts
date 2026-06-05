import type {
  CreateOfficialDeviceInput,
  OfficialDevice,
  OfficialDeviceStatus,
  TimeClockEntry,
  TimeClockHistoryRow,
  TimeClockStatus,
  TimeClockSummary,
  TimeClockType,
} from '@simpletpv/auth';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

const TOKEN_KEY = 'tpv-device-pairing-token';

export function getPairingToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setPairingToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sin localStorage, el dispositivo no queda emparejado de forma persistente.
  }
}

export function currentDevice(): Promise<OfficialDeviceStatus> {
  if (isDemo()) {
    return Promise.resolve({
      authorized: true,
      device: {
        id: 'demo-device',
        storeId: 'demo-store-centro',
        name: 'TPV Demo Centro',
        pairedAt: '2026-06-02T08:00:00.000Z',
        lastSeenAt: new Date().toISOString(),
      },
    });
  }
  const token = getPairingToken();
  return api.get<OfficialDeviceStatus>('/devices/current', token ? { pairingToken: token } : {});
}

export async function pairDevice(pairingToken: string): Promise<OfficialDeviceStatus> {
  const status = isDemo()
    ? await currentDevice()
    : await api.post<OfficialDeviceStatus>('/devices/pair', { pairingToken });
  if (status.authorized) setPairingToken(pairingToken);
  return status;
}

export function createOfficialDevice(input: CreateOfficialDeviceInput): Promise<OfficialDevice> {
  if (isDemo()) {
    return Promise.resolve({
      id: 'demo-device-new',
      storeId: input.storeId,
      name: input.name,
      pairingToken: 'DEMO123456',
      authorized: false,
      pairedAt: null,
      lastSeenAt: null,
    });
  }
  return api.post<OfficialDevice>('/devices', input);
}

// Store de fichajes en memoria para el modo demo. Persiste mientras la pestaña no
// se recargue, así el panel refleja el estado real (entrada/pausa/salida) sin
// backend — antes currentTimeClock() devolvía null siempre y el toggle no cambiaba.
const demoEntries: TimeClockEntry[] = [];

// Deriva el resumen de la jornada (estado + horas) a partir de la secuencia de
// fichajes. Mantén la lógica alineada con apps/api/src/time-clock/time-clock.compute.ts.
function summarizeDemo(storeId: string): TimeClockSummary {
  const entries = demoEntries.filter((e) => e.storeId === storeId);
  const now = Date.now();
  let status: TimeClockStatus = 'OUT';
  let segStart: number | null = null;
  let breakStart: number | null = null;
  let workedMs = 0;
  let breakMs = 0;

  for (const e of entries) {
    const t = new Date(e.createdAt).getTime();
    switch (e.type) {
      case 'CLOCK_IN':
        if (status === 'OUT') {
          status = 'IN';
          segStart = t;
        }
        break;
      case 'BREAK_START':
        if (status === 'IN') {
          if (segStart !== null) workedMs += t - segStart;
          segStart = null;
          breakStart = t;
          status = 'BREAK';
        }
        break;
      case 'BREAK_END':
        if (status === 'BREAK') {
          if (breakStart !== null) breakMs += t - breakStart;
          breakStart = null;
          segStart = t;
          status = 'IN';
        }
        break;
      case 'CLOCK_OUT':
        if (status === 'IN' || status === 'BREAK') {
          if (segStart !== null) workedMs += t - segStart;
          if (breakStart !== null) breakMs += t - breakStart;
          segStart = null;
          breakStart = null;
          status = 'OUT';
        }
        break;
    }
  }

  let runningSince: string | null = null;
  if (status === 'IN' && segStart !== null) {
    runningSince = new Date(segStart).toISOString();
  } else if (status === 'BREAK' && breakStart !== null) {
    breakMs += now - breakStart;
  }

  return { status, workedMs, breakMs, runningSince, entries };
}

// Clave de día local (YYYY-MM-DD), igual que localDayKey del backend.
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Jornadas pasadas de demo del propio empleado, con fechas relativas a hoy para que
// la tabla histórica tenga contenido sin caducar. Misma forma que el backend
// (history()): firstIn/lastOut en ISO y totales en ms.
function demoHistorySeed(now: Date): TimeClockHistoryRow[] {
  const HOUR = 3_600_000;
  const MIN = 60_000;
  const specs = [
    { offset: 1, in: [9, 2], out: [17, 10], worked: 7 * HOUR + 28 * MIN, brk: 20 * MIN },
    { offset: 2, in: [8, 55], out: [17, 5], worked: 7 * HOUR + 25 * MIN, brk: 45 * MIN },
    { offset: 3, in: [9, 0], out: [15, 0], worked: 6 * HOUR, brk: 0 },
    { offset: 5, in: [10, 0], out: [18, 30], worked: 8 * HOUR, brk: 30 * MIN },
    { offset: 7, in: [9, 10], out: [14, 10], worked: 5 * HOUR, brk: 0 },
  ] as const;
  const at = (base: Date, h: number, m: number): string => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  return specs.map((s) => {
    const base = new Date(now);
    base.setDate(base.getDate() - s.offset);
    return {
      userId: 'demo',
      userName: 'Empleado demo',
      storeId: 'demo-store-centro',
      storeName: 'Centro',
      date: localDayKey(base),
      firstIn: at(base, s.in[0], s.in[1]),
      lastOut: at(base, s.out[0], s.out[1]),
      workedMs: s.worked,
      breakMs: s.brk,
    };
  });
}

// Jornada de HOY derivada de los fichajes en memoria del demo, para que la tabla
// refleje en vivo lo que el empleado va fichando. null si aún no hay entrada hoy.
function demoTodayRow(storeId: string, now: Date): TimeClockHistoryRow | null {
  const summary = summarizeDemo(storeId);
  const clockIn = summary.entries.find((e) => e.type === 'CLOCK_IN');
  if (!clockIn) return null;
  const clockOut = [...summary.entries].reverse().find((e) => e.type === 'CLOCK_OUT');
  return {
    userId: 'demo',
    userName: 'Empleado demo',
    storeId,
    storeName: 'Centro',
    date: localDayKey(now),
    firstIn: clockIn.createdAt,
    lastOut: clockOut ? clockOut.createdAt : null,
    workedMs: summary.workedMs,
    breakMs: summary.breakMs,
  };
}

export function currentTimeClock(storeId: string): Promise<TimeClockEntry | null> {
  if (isDemo()) {
    const entries = demoEntries.filter((e) => e.storeId === storeId);
    return Promise.resolve(entries.length > 0 ? entries[entries.length - 1]! : null);
  }
  return api.get<TimeClockEntry | null>('/time-clock/current', { storeId });
}

// Resumen de la jornada de hoy (estado, horas y fichajes) para el panel del TPV.
export function timeClockToday(storeId: string): Promise<TimeClockSummary> {
  if (isDemo()) return Promise.resolve(summarizeDemo(storeId));
  return api.get<TimeClockSummary>('/time-clock/today', { storeId });
}

// Histórico de jornadas del propio empleado (tabla del panel de Fichaje). Sin rango
// → últimos 30 días (lo decide el backend); con `from`/`to` filtra por fecha.
export function timeClockHistory(
  storeId: string,
  range: { from?: string; to?: string },
): Promise<TimeClockHistoryRow[]> {
  if (isDemo()) {
    const now = new Date();
    const today = demoTodayRow(storeId, now);
    const rows = [...(today ? [today] : []), ...demoHistorySeed(now)];
    const filtered = rows
      .filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return Promise.resolve(filtered);
  }
  const params: Record<string, string> = { storeId };
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  return api.get<TimeClockHistoryRow[]>('/time-clock/history/me', params);
}

export function createTimeClockEntry(input: {
  storeId: string;
  deviceId?: string;
  type: TimeClockType;
}): Promise<TimeClockEntry> {
  if (isDemo()) {
    const entry: TimeClockEntry = {
      id: `demo-clock-${demoEntries.length + 1}`,
      storeId: input.storeId,
      userId: 'demo',
      deviceId: input.deviceId ?? 'demo-device',
      type: input.type,
      createdAt: new Date().toISOString(),
    };
    demoEntries.push(entry);
    return Promise.resolve(entry);
  }
  return api.post<TimeClockEntry>('/time-clock', input);
}
