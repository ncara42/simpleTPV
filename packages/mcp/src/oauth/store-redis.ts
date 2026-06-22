/**
 * Implementación del OAuthStore sobre Redis: estado durable y compartido entre
 * instancias. Misma interfaz que InMemoryOAuthStore. Los TTL los gestiona Redis
 * (los códigos y refresh caducan solos); los canjes single-use usan GETDEL
 * atómico para evitar reuso en condiciones de carrera.
 */

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createClient } from 'redis';

import type {
  AuthorizationCodeRecord,
  BackendSessionRecord,
  OAuthStore,
  RefreshTokenRecord,
} from './store.js';

const PREFIX = 'mcp:oauth';
const CODE_TTL_S = 60;
const REFRESH_TTL_S = 7 * 24 * 60 * 60;
const SESSION_TTL_S = 7 * 24 * 60 * 60;

type RedisClient = ReturnType<typeof createClient>;

export async function createRedisStore(url: string): Promise<OAuthStore> {
  const client = createClient({ url });
  client.on('error', (err) => console.error('Redis error:', err));
  await client.connect();
  return new RedisOAuthStore(client);
}

class RedisOAuthStore implements OAuthStore {
  constructor(private readonly redis: RedisClient) {}

  private key(kind: string, id: string): string {
    return `${PREFIX}:${kind}:${id}`;
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const v = await this.redis.get(this.key('client', clientId));
    return v ? (JSON.parse(v) as OAuthClientInformationFull) : undefined;
  }

  async saveClient(client: OAuthClientInformationFull): Promise<void> {
    await this.redis.set(this.key('client', client.client_id), JSON.stringify(client));
  }

  async saveCode(code: string, record: AuthorizationCodeRecord): Promise<void> {
    await this.redis.set(this.key('code', code), JSON.stringify(record), { EX: CODE_TTL_S });
  }

  async peekCode(code: string): Promise<AuthorizationCodeRecord | undefined> {
    const v = await this.redis.get(this.key('code', code));
    return v ? (JSON.parse(v) as AuthorizationCodeRecord) : undefined;
  }

  async takeCode(code: string): Promise<AuthorizationCodeRecord | undefined> {
    const v = await this.redis.getDel(this.key('code', code)); // single-use atómico
    return v ? (JSON.parse(v) as AuthorizationCodeRecord) : undefined;
  }

  async saveRefresh(token: string, record: RefreshTokenRecord): Promise<void> {
    await this.redis.set(this.key('refresh', token), JSON.stringify(record), { EX: REFRESH_TTL_S });
  }

  async takeRefresh(token: string): Promise<RefreshTokenRecord | undefined> {
    const v = await this.redis.getDel(this.key('refresh', token)); // rotación atómica
    return v ? (JSON.parse(v) as RefreshTokenRecord) : undefined;
  }

  async revokeRefresh(token: string): Promise<void> {
    await this.redis.del(this.key('refresh', token));
  }

  async saveBackendSession(grantId: string, record: BackendSessionRecord): Promise<void> {
    await this.redis.set(this.key('bsession', grantId), JSON.stringify(record), {
      EX: SESSION_TTL_S,
    });
  }

  async getBackendSession(grantId: string): Promise<BackendSessionRecord | undefined> {
    const v = await this.redis.get(this.key('bsession', grantId));
    return v ? (JSON.parse(v) as BackendSessionRecord) : undefined;
  }

  async deleteBackendSession(grantId: string): Promise<void> {
    await this.redis.del(this.key('bsession', grantId));
  }
}
