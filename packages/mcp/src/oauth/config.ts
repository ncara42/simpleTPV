/**
 * Configuración del servidor MCP en modo HTTP (OAuth 2.1).
 *
 * El MCP es a la vez Authorization Server y Resource Server (un solo despliegue
 * multi-tenant). La identidad se delega en el backend SimpleTpv vía /auth/login,
 * de modo que NO hay credenciales de empresa empotradas aquí: cada usuario entra
 * con las suyas y el token resultante lleva su organizationId.
 *
 * Variables:
 *  - MCP_ISSUER_URL      URL pública del servidor (issuer del AS y base de los
 *                        endpoints). Ej: https://mcp.tudominio.com
 *  - MCP_RESOURCE_URL    Identificador del recurso protegido (audiencia de los
 *                        tokens). Por defecto `${issuer}/mcp`.
 *  - MCP_PORT            Puerto de escucha (default 8766).
 *  - MCP_BIND            Interfaz de bind (default 127.0.0.1; TLS en el proxy).
 *  - TPV_API_URL         URL del backend Rust (default http://localhost:3001).
 *  - MCP_JWT_PRIVATE_JWK JWK privada EC P-256 (JSON) para firmar los access
 *                        tokens del MCP. Si falta, en local se genera una
 *                        efímera (los tokens no sobreviven a un reinicio).
 *  - MCP_ENC_KEY         Clave (base64/hex/texto) para cifrar la cookie de
 *                        backend en reposo (AES-256-GCM). Si falta → efímera.
 *  - REDIS_URL           Si está, el estado OAuth vive en Redis (durable,
 *                        multi-instancia). Si no, almacén en memoria.
 *  - MCP_ALLOWED_ORIGINS Orígenes CORS permitidos (CSV). Ej: https://claude.ai
 *  - MCP_TRUST_PROXY     Saltos de proxy de confianza para Express (`trust proxy`).
 *                        El modo HTTP SIEMPRE va tras un proxy inverso
 *                        (Traefik/Cloudflare): si llega `X-Forwarded-For` y esto
 *                        vale `false`, el rate-limiter del SDK lanza
 *                        ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (500 en /register,
 *                        /token, /authorize). Por eso el **default en modo HTTP es
 *                        `1`** (confía en 1 salto: el proxy inverso de delante).
 *                        Acepta un número de saltos, `true`/`false`, o subred/
 *                        `loopback`. Para local SIN proxy, pon `MCP_TRUST_PROXY=false`
 *                        explícito. NO uses `true` en producción: es permisivo y
 *                        permite spoofing del IP de cliente.
 */

export interface HttpConfig {
  issuerUrl: URL;
  resourceUrl: URL;
  port: number;
  bindHost: string;
  apiUrl: string;
  privateJwk: string | undefined;
  encKey: string | undefined;
  redisUrl: string | undefined;
  allowedOrigins: string[];
  /** Valor para Express `app.set('trust proxy', …)`. Ver MCP_TRUST_PROXY. */
  trustProxy: boolean | number | string;
}

let _config: HttpConfig | null = null;

/**
 * Parsea MCP_TRUST_PROXY al tipo que espera Express `trust proxy`:
 *  - sin definir / vacío → false (local, sin proxy delante)
 *  - "true" / "false"    → booleano
 *  - entero (ej. "1")    → número de saltos de confianza
 *  - cualquier otra cosa → string (subred CSV, "loopback", etc.)
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? '').trim();
  if (value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

export function getHttpConfig(): HttpConfig {
  if (_config) return _config;

  const issuerRaw = process.env['MCP_ISSUER_URL'];
  if (!issuerRaw) {
    throw new Error(
      'MCP_ISSUER_URL es obligatorio en modo HTTP (URL pública del servidor, ' +
        'p. ej. https://mcp.tudominio.com). Para uso local sin OAuth usa MCP_TRANSPORT=stdio.',
    );
  }

  const issuerUrl = new URL(issuerRaw);
  const resourceUrl = new URL(process.env['MCP_RESOURCE_URL'] ?? `${issuerUrl.origin}/mcp`);

  _config = {
    issuerUrl,
    resourceUrl,
    port: Number.parseInt(process.env['MCP_PORT'] ?? '8766', 10),
    bindHost: process.env['MCP_BIND'] ?? '127.0.0.1',
    apiUrl: process.env['TPV_API_URL'] ?? 'http://localhost:3001',
    privateJwk: process.env['MCP_JWT_PRIVATE_JWK'],
    encKey: process.env['MCP_ENC_KEY'],
    redisUrl: process.env['REDIS_URL'],
    allowedOrigins: (process.env['MCP_ALLOWED_ORIGINS'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Modo HTTP = siempre tras proxy inverso → default `1` si no se configura
    // (evita ERR_ERL_UNEXPECTED_X_FORWARDED_FOR). Para local sin proxy: =false.
    trustProxy: parseTrustProxy(process.env['MCP_TRUST_PROXY'] ?? '1'),
  };
  return _config;
}
