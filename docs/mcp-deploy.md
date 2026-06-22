# Despliegue del MCP SimpleTpv (OAuth 2.1, remoto multi-tenant)

El MCP es un **único servidor remoto** al que se conecta cualquier usuario desde
Claude (Desktop, web o Code) como _custom connector_. Cada persona entra con
**sus** credenciales de SimpleTpv; el token resultante lleva su `organizationId`
y el RLS del backend le devuelve **solo los datos de su empresa**. No es una app
instalable: es una URL.

```
Claude (cliente OAuth)  ──OAuth 2.1──▶  MCP (Authorization + Resource Server)
                                              │  valida token (audiencia)
                                              │  login delegado a /auth/login
                                              ▼
                                        backend SimpleTpv (RLS por organización)
```

El MCP nunca reenvía el token del cliente al backend (sin _token passthrough_):
usa la sesión de backend del usuario, guardada cifrada server-side.

## Requisitos

- Un dominio para el MCP, p. ej. `mcp.tuempresa.com`, con **TLS** terminado por
  el reverse proxy de Dokploy (Traefik). OAuth 2.1 exige HTTPS.
- **Redis** accesible (Dokploy puede levantar uno) — almacén del estado OAuth.
- El backend SimpleTpv accesible desde el contenedor del MCP.

## 1. Generar las dos claves

```bash
# Clave de firma de los access tokens (JWK privada EC P-256, en una línea):
node -e "import('jose').then(async j=>{const{privateKey}=await j.generateKeyPair('ES256',{extractable:true});const k=await j.exportJWK(privateKey);k.kid='mcp-'+Date.now();console.log(JSON.stringify(k))})"

# Clave para cifrar la sesión de backend en reposo (AES-256-GCM):
openssl rand -base64 32
```

Guárdalas como secretos en Dokploy (`MCP_JWT_PRIVATE_JWK` y `MCP_ENC_KEY`).
Si rotas `MCP_JWT_PRIVATE_JWK`, los tokens vivos dejan de valer (los clientes
re-autentican solos). Si rotas `MCP_ENC_KEY`, las sesiones de backend guardadas
dejan de poder descifrarse (los usuarios re-autentican).

## 2. Variables de entorno

| Variable              | Obligatoria | Ejemplo                        | Notas                                   |
| --------------------- | :---------: | ------------------------------ | --------------------------------------- |
| `MCP_TRANSPORT`       |      –      | `http`                         | Es el valor por defecto                 |
| `MCP_ISSUER_URL`      |     ✅      | `https://mcp.tuempresa.com`    | URL pública (https)                     |
| `TPV_API_URL`         |     ✅      | `http://simpletpv-api:3001`    | Backend, alcanzable desde el contenedor |
| `MCP_JWT_PRIVATE_JWK` |     ✅      | `{"kty":"EC",...}`             | Clave de firma (paso 1)                 |
| `MCP_ENC_KEY`         |     ✅      | `base64…`                      | Clave de cifrado (paso 1)               |
| `REDIS_URL`           |     ✅      | `redis://simpletpv-redis:6379` | Sin esto, almacén en memoria (solo dev) |
| `MCP_ALLOWED_ORIGINS` | recomendada | `https://claude.ai`            | CORS                                    |
| `MCP_PORT`            |      –      | `8766`                         | Puerto interno                          |
| `MCP_BIND`            |      –      | `0.0.0.0`                      | Ya es el default de la imagen           |

`MCP_RESOURCE_URL` se deriva como `${MCP_ISSUER_URL}/mcp`; normalmente no se toca.

## 3. Servicio en Dokploy

1. Nuevo servicio de tipo **Dockerfile**, repositorio del monorepo.
2. **Dockerfile path:** `packages/mcp/Dockerfile`; **build context:** raíz del repo.
3. **Puerto del contenedor:** `8766`.
4. **Dominio:** `mcp.tuempresa.com` con **HTTPS/Let's Encrypt** activado.
5. **Variables de entorno:** las del paso 2 (claves como secretos).
6. Asegura que `TPV_API_URL` y `REDIS_URL` resuelven en la red interna de Dokploy.
7. Deploy.

Verifica tras el deploy:

```bash
curl https://mcp.tuempresa.com/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://mcp.tuempresa.com/mcp -d '{}'   # → 401 + WWW-Authenticate
```

## 4. Conectar desde Claude

En Claude (Desktop/web): **Ajustes → Conectores → Añadir conector personalizado**
→ pega `https://mcp.tuempresa.com/mcp` → **Conectar**. Claude descubre el OAuth,
abre el navegador y pide email + contraseña de SimpleTpv en el diálogo nativo.
Tras validar, el conector queda activo y las 36 tools disponibles.

En Claude Code: añade el servidor MCP remoto con esa misma URL.

## 5. Uso local (sin desplegar) — transporte stdio

Para un único usuario en local, sin OAuth (según la spec, stdio toma las
credenciales del entorno):

```jsonc
{
  "mcpServers": {
    "simpletpv": {
      "command": "node",
      "args": ["/ruta/packages/mcp/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "TPV_API_URL": "http://localhost:3001",
        "TPV_EMAIL": "admin@tuempresa.com",
        "TPV_PASSWORD": "…",
      },
    },
  },
}
```

## Notas de seguridad

- TLS es obligatorio (lo termina el reverse proxy); el MCP escucha en claro detrás.
- Access tokens cortos (15 min) con audiencia (RFC 8707); refresh con rotación.
- Sesión de backend cifrada en reposo (AES-256-GCM).
- La sesión MCP queda atada al usuario (anti-secuestro de sesión).
- Sin secretos compartidos: cada usuario tiene su identidad y su token.
