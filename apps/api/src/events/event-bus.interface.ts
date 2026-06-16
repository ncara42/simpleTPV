import type { Observable } from 'rxjs';

// Tipos de evento que viajan por el canal en tiempo real (#32). El payload es
// libre por tipo; el cliente filtra por `type`. Todos los eventos están acotados
// a un tenant (organizationId) por el servidor — el cliente nunca elige el tenant.
// cash.movement.requested (#146): un CLERK solicitó un movimiento de efectivo
// (ingreso/retirada/traspaso); refresca la campana de aprobaciones del backoffice.
type AppEventType =
  | 'stock.changed'
  | 'sale.completed'
  | 'alert.created'
  | 'cash.movement.requested';

export interface AppEvent {
  type: AppEventType;
  data: Record<string, unknown>;
}

// Bus de eventos por tenant. publish difunde a todos los suscriptores del tenant
// (en esta y otras réplicas si el backend es Redis); subscribe devuelve un
// Observable con los eventos de ESE tenant.
export interface EventBus {
  publish(organizationId: string, event: AppEvent): Promise<void>;
  subscribe(organizationId: string): Observable<AppEvent>;
}

export const EVENT_BUS = Symbol('EVENT_BUS');
