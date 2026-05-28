import { type Observable, Subject } from 'rxjs';

import type { AppEvent, EventBus } from './event-bus.interface.js';

// Bus de eventos en proceso (un Subject por tenant). Para una sola instancia de
// la API (dev/test); no difunde entre réplicas. Suficiente como fallback cuando
// no hay REDIS_URL.
export class InMemoryEventBus implements EventBus {
  private readonly subjects = new Map<string, Subject<AppEvent>>();

  private subjectFor(organizationId: string): Subject<AppEvent> {
    let s = this.subjects.get(organizationId);
    if (!s) {
      s = new Subject<AppEvent>();
      this.subjects.set(organizationId, s);
    }
    return s;
  }

  async publish(organizationId: string, event: AppEvent): Promise<void> {
    this.subjectFor(organizationId).next(event);
  }

  subscribe(organizationId: string): Observable<AppEvent> {
    return this.subjectFor(organizationId).asObservable();
  }
}
