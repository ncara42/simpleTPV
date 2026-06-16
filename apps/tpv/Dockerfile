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
# Modo demo OPT-IN (A-01): por defecto la imagen se hornea en modo REAL (login real
# contra la API; isDemo() solo es true si VITE_DEMO_MODE === 'true'). Producción NUNCA
# cae en demo por omisión. Para la fase de presentaciones al cliente con datos demo y
# sin fricción de login, pasar EXPLÍCITAMENTE --build-arg VITE_DEMO_MODE=true (en el
# proyecto de Dokploy de presentación). En demo, login() ignora las credenciales y las
# libs devuelven datos demo (no se toca la API).
ARG VITE_DEMO_MODE
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
COPY . .
RUN pnpm --filter @simpletpv/tpv run build

# Imagen unprivileged: corre como usuario `nginx` (no root) y escucha en 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
# Hardening de la capa base (#112): la imagen oficial fija paquetes Alpine que
# arrastran CVEs ya parcheados upstream (openssl/libcrypto3/libssl3, libpng,
# libxml2, libexpat...). `apk upgrade` trae las versiones corregidas del repo
# Alpine sin tocar la app. Se ejecuta como root y luego se vuelve a `nginx`.
USER root
RUN apk upgrade --no-cache
USER nginx
ENV API_URL=http://simpletpv-api:3001
COPY --from=builder /repo/apps/tpv/dist /usr/share/nginx/html
COPY apps/tpv/nginx.conf.template /etc/nginx/templates/default.conf.template
# La imagen base ya corre como `nginx`; lo declaramos explícito para el análisis
# estático (Trivy DS-0002 no resuelve el USER de la imagen base).
USER nginx
EXPOSE 8080
