import type {
  CreateOfficialDeviceInput,
  OfficialDevice,
  OfficialDeviceStatus,
  TimeClockEntry,
  TimeClockHistoryRow,
  TimeClockSummary,
  TimeClockType,
} from '@simpletpv/auth';

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
  const token = getPairingToken();
  return api.get<OfficialDeviceStatus>('/devices/current', token ? { pairingToken: token } : {});
}

export async function pairDevice(pairingToken: string): Promise<OfficialDeviceStatus> {
  const status = await api.post<OfficialDeviceStatus>('/devices/pair', { pairingToken });
  if (status.authorized) setPairingToken(pairingToken);
  return status;
}

export function createOfficialDevice(input: CreateOfficialDeviceInput): Promise<OfficialDevice> {
  return api.post<OfficialDevice>('/devices', input);
}

export function currentTimeClock(storeId: string): Promise<TimeClockEntry | null> {
  return api.get<TimeClockEntry | null>('/time-clock/current', { storeId });
}

export function timeClockToday(storeId: string): Promise<TimeClockSummary> {
  return api.get<TimeClockSummary>('/time-clock/today', { storeId });
}

export function timeClockHistory(
  storeId: string,
  range: { from?: string; to?: string },
): Promise<TimeClockHistoryRow[]> {
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
  return api.post<TimeClockEntry>('/time-clock', input);
}
