# syntax=docker/dockerfile:1
# Build desde la raíz del monorepo:
#   docker build -f apps/tpv/Dockerfile -t simpletpv-tpv .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/web-config/package.json packages/web-config/
COPY apps/api/package.json apps/api/
COPY apps/tpv/package.json apps/tpv/
COPY apps/backoffice/package.json apps/backoffice/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS builder
# URL del backoffice para el toggle Backoffice/TPV (override OPCIONAL). Por defecto
# apps/tpv/src/lib/nav.ts deriva la URL del hostname en runtime
# (tpv.noelcaravaca.com → admin.noelcaravaca.com), así que ya no hace falta este
# build arg. Pásalo solo si los dominios no siguen el patrón admin/tpv.
ARG VITE_BACKOFFICE_URL
ENV VITE_BACKOFFICE_URL=$VITE_BACKOFFICE_URL
# TEMPORAL — fase de presentaciones al cliente (jun 2026). El equipo (Noel + Marco)
# enseña el TPV al cliente con datos demo y sin fricción de login, así que la imagen
# de producción se hornea en MODO DEMO por defecto: isDemo() es true salvo que
# VITE_DEMO_MODE sea exactamente 'false'. En demo, login() ignora las credenciales y
# todas las libs de datos devuelven datos demo (no se toca la API). Así cualquier
# despliegue del repo (incluido el Dokploy de Marco) arranca en demo sin config extra.
# REVERTIR antes de lanzar con auth real: volver a 'false' (era el default por SEC-04)
# y quitar el override VITE_DEMO_MODE=true del build arg en los proyectos de Dokploy.
ARG VITE_DEMO_MODE=true
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
COPY . .
RUN pnpm --filter @simpletpv/tpv run build

# Imagen unprivileged: corre como usuario `nginx` (no root) y escucha en 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
ENV API_URL=http://simpletpv-api:3001
COPY --from=builder /repo/apps/tpv/dist /usr/share/nginx/html
COPY apps/tpv/nginx.conf.template /etc/nginx/templates/default.conf.template
# La imagen base ya corre como `nginx`; lo declaramos explícito para el análisis
# estático (Trivy DS-0002 no resuelve el USER de la imagen base).
USER nginx
EXPOSE 8080
