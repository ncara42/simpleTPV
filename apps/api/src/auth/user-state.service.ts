import { Injectable } from '@nestjs/common';

import { AuthLookupService } from './auth-lookup.service.js';

export interface UserState {
  active: boolean;
  role: string;
}

// Puerto que el AuthGuard consume para revalidar el estado del usuario por
// petición (A-04). Token de inyección desacoplado para poder mockearlo en tests
// y para que el guard no dependa de la implementación concreta.
export interface UserStateValidator {
  getState(userId: string): Promise<UserState | null>;
}

export const USER_STATE_VALIDATOR = Symbol('USER_STATE_VALIDATOR');

function ttlMs(): number {
  const n = Number(process.env.AUTH_REVALIDATE_TTL_MS ?? 15000);
  return Number.isFinite(n) && n >= 0 ? n : 15000;
}

// Revalida active/role del usuario contra la BD con un cache en-proceso de pocos
// segundos (A-04). Sin esto, el AuthGuard solo verifica la firma del JWT y un
// usuario desactivado o degradado conservaría privilegios hasta caducar su access
// token (ventana ≤15 min). El cache acota el coste a un lookup por usuario y
// ventana; cachea también el negativo (usuario borrado) para no martillear la BD.
// La conexión es la BYPASSRLS de AuthLookupService porque el guard corre antes de
// fijar el tenant. Un cache en-proceso (no Redis) basta: cada réplica revalida de
// forma independiente y la ventana de inconsistencia se mantiene en ~TTL.
@Injectable()
export class UserStateService implements UserStateValidator {
  private readonly cache = new Map<string, { state: UserState | null; expiresAt: number }>();
  private readonly ttl = ttlMs();

  constructor(private readonly lookup: AuthLookupService) {}

  async getState(userId: string): Promise<UserState | null> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > now) {
      return hit.state;
    }
    // Puede lanzar si la BD no está disponible: se propaga a propósito para que el
    // guard haga fail-open (la firma del token ya garantiza autenticidad; esta
    // revalidación es defensa en profundidad best-effort, no debe tumbar la auth).
    const user = await this.lookup.getUserState(userId);
    const state: UserState | null = user ? { active: user.active, role: user.role } : null;
    this.cache.set(userId, { state, expiresAt: now + this.ttl });
    return state;
  }
}
