import {
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  type MessageEvent,
  Req,
  Sse,
} from '@nestjs/common';
import { finalize, interval, map, merge, type Observable } from 'rxjs';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { sseMaxConnectionsPerUser } from '../config/security.js';
import { EVENT_BUS, type EventBus } from './event-bus.interface.js';

// Intervalo del heartbeat SSE: un comentario keep-alive periódico mantiene viva
// la conexión y permite al cliente detectar caídas.
const HEARTBEAT_MS = 15_000;

// Tope de conexiones SSE concurrentes por usuario en esta réplica (SEC-03).
const MAX_SSE_PER_USER = sseMaxConnectionsPerUser(process.env);

@Controller('events')
export class EventsController {
  // Conexiones SSE activas por usuario (en esta réplica). Acota cuántas conexiones
  // Redis dedicadas puede abrir un usuario a la vez: cada SSE abre una y solo se
  // cierra al desuscribirse, así que sin tope son una vía de agotamiento (SEC-03).
  private readonly activeByUser = new Map<string, number>();

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
   *
   * Límite anti-abuso: máximo MAX_SSE_PER_USER conexiones concurrentes por usuario
   * (429 al superarlo). Se libera al cerrar la conexión (finalize).
   */
  @Sse()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  stream(@Req() req: { user: JwtPayload }): Observable<MessageEvent> {
    const userId = req.user.sub;
    const organizationId = req.user.organizationId;

    const current = this.activeByUser.get(userId) ?? 0;
    if (current >= MAX_SSE_PER_USER) {
      throw new HttpException(
        'Demasiadas conexiones SSE abiertas; cierra alguna e inténtalo de nuevo',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.activeByUser.set(userId, current + 1);

    const events = this.bus
      .subscribe(organizationId)
      .pipe(map((event): MessageEvent => ({ type: event.type, data: event.data })));

    // Heartbeat: evento `ping` periódico. Mantiene la conexión y deja al cliente
    // detectar la caída si dejan de llegar pings.
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { ts: Date.now() } })),
    );

    // Al cerrar la conexión (cliente desconecta, error o completado), libera el
    // hueco del usuario para que pueda volver a conectarse.
    return merge(events, heartbeat).pipe(
      finalize(() => {
        const n = (this.activeByUser.get(userId) ?? 1) - 1;
        if (n <= 0) {
          this.activeByUser.delete(userId);
        } else {
          this.activeByUser.set(userId, n);
        }
      }),
    );
  }
}
