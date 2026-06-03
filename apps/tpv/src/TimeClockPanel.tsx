import { Button } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useState } from 'react';

import {
  createTimeClockEntry,
  currentDevice,
  currentTimeClock,
  pairDevice,
} from './lib/time-clock.js';

export function TimeClockPanel({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const device = useQuery({ queryKey: ['official-device'], queryFn: currentDevice });
  const clock = useQuery({
    queryKey: ['time-clock-current', storeId],
    queryFn: () => currentTimeClock(storeId as string),
    enabled: storeId !== null && device.data?.authorized === true,
  });

  const pair = useMutation({
    mutationFn: pairDevice,
    onSuccess: () => {
      setToken('');
      void qc.invalidateQueries({ queryKey: ['official-device'] });
    },
  });

  const punch = useMutation({
    mutationFn: () => {
      const last = clock.data?.type;
      return createTimeClockEntry({
        storeId: storeId as string,
        ...(device.data?.device?.id ? { deviceId: device.data.device.id } : {}),
        type: last === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN',
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['time-clock-current', storeId] }),
  });

  if (!device.data?.authorized) {
    return (
      <div className="time-clock-view" data-testid="time-clock-locked">
        <div className="tickets-head">
          <div>
            <h2>Fichaje</h2>
            <p>Este dispositivo no está autorizado como TPV oficial.</p>
          </div>
          <Clock size={22} />
        </div>
        <div className="cash-card">
          <label className="cash-field">
            <span>Token de pairing</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              data-testid="device-token"
            />
          </label>
          <Button
            disabled={token.trim().length < 6 || pair.isPending}
            onClick={() => pair.mutate(token.trim())}
            data-testid="device-pair"
          >
            Autorizar dispositivo
          </Button>
          {pair.isError && <p className="cash-error">Token no válido o no autorizado.</p>}
        </div>
      </div>
    );
  }

  const clockedIn = clock.data?.type === 'CLOCK_IN';

  return (
    <div className="time-clock-view" data-testid="time-clock-view">
      <div className="tickets-head">
        <div>
          <h2>Fichaje</h2>
          <p>{device.data.device?.name}</p>
        </div>
        <Clock size={22} />
      </div>
      <div className="cash-card">
        <span className="cash-card-badge" data-testid="time-clock-state">
          {clockedIn ? 'Fichado' : 'Sin fichaje activo'}
        </span>
        <Button
          onClick={() => punch.mutate()}
          disabled={storeId === null || punch.isPending}
          data-testid="time-clock-toggle"
        >
          {clockedIn ? 'Fichar salida' : 'Fichar entrada'}
        </Button>
      </div>
    </div>
  );
}
