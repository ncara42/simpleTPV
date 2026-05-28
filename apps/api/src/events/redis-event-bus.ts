import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';

import type { AppEvent, EventBus } from './event-bus.interface.js';

// Bus de eventos sobre Redis pub/sub (#32). Difunde entre réplicas: publish
// hace PUBLISH al canal del tenant; subscribe abre una conexión Redis dedicada
// (ioredis no permite comandos normales en una conexión en modo subscribe) y
// reenvía los mensajes del canal del tenant como un Observable.
//
// Best-effort en publish: si Redis falla, loguea y no propaga (un evento perdido
// no debe tumbar la operación de negocio que ya hizo commit).
export class RedisEventBus implements EventBus {
  private readonly logger = new Logger(RedisEventBus.name);

  // `pub` para PUBLISH; `subFactory` crea una conexión nueva por suscripción
  // (cada SSE abierto). Se cierra al desuscribirse.
  constructor(
    private readonly pub: Redis,
    private readonly subFactory: () => Redis,
  ) {}

  private channel(organizationId: string): string {
    return `events:${organizationId}`;
  }

  async publish(organizationId: string, event: AppEvent): Promise<void> {
    try {
      await this.pub.publish(this.channel(organizationId), JSON.stringify(event));
    } catch (err) {
      this.logger.warn(`No se pudo publicar el evento (Redis): ${String(err)}`);
    }
  }

  subscribe(organizationId: string): Observable<AppEvent> {
    const channel = this.channel(organizationId);
    return new Observable<AppEvent>((subscriber) => {
      const sub = this.subFactory();
      const onMessage = (ch: string, message: string) => {
        if (ch !== channel) {
          return;
        }
        try {
          subscriber.next(JSON.parse(message) as AppEvent);
        } catch (err) {
          this.logger.warn(`Evento SSE malformado, ignorado: ${String(err)}`);
        }
      };
      sub.on('message', onMessage);
      sub.subscribe(channel).catch((err) => {
        this.logger.warn(`No se pudo suscribir a ${channel}: ${String(err)}`);
      });
      // Cleanup al cerrar el SSE: quita el listener y cierra la conexión dedicada.
      return () => {
        sub.off('message', onMessage);
        void sub.quit().catch(() => sub.disconnect());
      };
    });
  }
}
