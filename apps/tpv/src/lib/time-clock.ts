import type {
  CreateOfficialDeviceInput,
  OfficialDevice,
  OfficialDeviceStatus,
  TimeClockEntry,
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

export function currentTimeClock(storeId: string): Promise<TimeClockEntry | null> {
  if (isDemo()) return Promise.resolve(null);
  return api.get<TimeClockEntry | null>('/time-clock/current', { storeId });
}

export function createTimeClockEntry(input: {
  storeId: string;
  deviceId?: string;
  type: TimeClockType;
}): Promise<TimeClockEntry> {
  if (isDemo()) {
    return Promise.resolve({
      id: `demo-clock-${Date.now()}`,
      storeId: input.storeId,
      userId: 'demo',
      deviceId: input.deviceId ?? 'demo-device',
      type: input.type,
      createdAt: new Date().toISOString(),
    });
  }
  return api.post<TimeClockEntry>('/time-clock', input);
}
