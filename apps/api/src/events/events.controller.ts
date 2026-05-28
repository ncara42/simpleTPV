import { Controller, Inject, type MessageEvent, Req, Sse } from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { EVENT_BUS, type EventBus } from './event-bus.interface.js';

// Intervalo del heartbeat SSE: un comentario keep-alive periódico mantiene viva
// la conexión y permite al cliente detectar caídas.
const HEARTBEAT_MS = 15_000;

@Controller('events')
export class EventsController {
  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  /**
   * Stream SSE multiplexado (#32) filtrado por el tenant del JWT. Emite
   * stock.changed / sale.completed / alert.created SOLO de la organización del
   * usuario autenticado (el filtrado es del servidor, derivado del JWT — el
   * cliente nunca elige el tenant). Incluye heartbeat keep-alive.
   *
   * Nota: el AuthGuard global exige `Authorization: Bearer`. Desde el navegador,
   * el cliente debe usar un EventSource que permita cabeceras (p.ej.
   * fetch-event-source), no el EventSource nativo.
   */
  @Sse()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  stream(@Req() req: { user: JwtPayload }): Observable<MessageEvent> {
    const organizationId = req.user.organizationId;

    const events = this.bus
      .subscribe(organizationId)
      .pipe(map((event): MessageEvent => ({ type: event.type, data: event.data })));

    // Heartbeat: evento `ping` periódico. Mantiene la conexión y deja al cliente
    // detectar la caída si dejan de llegar pings.
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { ts: Date.now() } })),
    );

    return merge(events, heartbeat);
  }
}
