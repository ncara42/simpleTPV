import type { CreateOfficialDeviceInput, OfficialDevice } from '@simpletpv/auth';

import { api } from './auth.js';

// Resumen del listado: el token NUNCA viaja en el GET (solo al crear).
export type DeviceSummary = Omit<OfficialDevice, 'pairingToken'>;

export function listDevices(storeId?: string): Promise<DeviceSummary[]> {
  return api.get<DeviceSummary[]>('/devices', { ...(storeId ? { storeId } : {}) });
}

// Crea el dispositivo y devuelve el token de emparejamiento UNA sola vez.
export function createDevice(input: CreateOfficialDeviceInput): Promise<OfficialDevice> {
  return api.post<OfficialDevice>('/devices', input);
}

export function revokeDevice(id: string): Promise<void> {
  return api.del(`/devices/${id}`);
}
