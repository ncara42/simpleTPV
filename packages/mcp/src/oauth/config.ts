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
 *  - MCP_ALLOWED_ORIGINS Orígenes CORS permitidos (CSV). Ej: https://claude.ai
 */

export interface HttpConfig {
  issuerUrl: URL;
  resourceUrl: URL;
  port: number;
  bindHost: string;
  apiUrl: string;
  privateJwk: string | undefined;
  allowedOrigins: string[];
}

let _config: HttpConfig | null = null;

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
    allowedOrigins: (process.env['MCP_ALLOWED_ORIGINS'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return _config;
}
