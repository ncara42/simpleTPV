# syntax=docker/dockerfile:1
# Build desde la raíz del monorepo:
#   docker build -f apps/backoffice/Dockerfile -t simpletpv-backoffice .

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
# URL del TPV para el toggle Backoffice/TPV (override OPCIONAL). Por defecto
# apps/backoffice/src/lib/nav.ts deriva la URL del hostname en runtime
# (admin.noelcaravaca.com → tpv.noelcaravaca.com), así que ya no hace falta este
# build arg. Pásalo solo si los dominios no siguen el patrón admin/tpv.
ARG VITE_TPV_URL
ENV VITE_TPV_URL=$VITE_TPV_URL
# Modo demo OPT-IN (A-02): por defecto la imagen se hornea en modo REAL (exige login
# real contra la API). NUNCA debe ser el default — sería un panel de administración
# con login ADMIN falso sin autenticación. Para presentaciones con datos demo, pasar
# EXPLÍCITAMENTE --build-arg VITE_DEMO_MODE=true.
ARG VITE_DEMO_MODE
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
COPY . .
RUN pnpm --filter @simpletpv/backoffice run build

# Imagen unprivileged: corre como usuario `nginx` (no root) y escucha en 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
ENV API_URL=http://simpletpv-api:3001
COPY --from=builder /repo/apps/backoffice/dist /usr/share/nginx/html
COPY apps/backoffice/nginx.conf.template /etc/nginx/templates/default.conf.template
# La imagen base ya corre como `nginx`; lo declaramos explícito para el análisis
# estático (Trivy DS-0002 no resuelve el USER de la imagen base).
USER nginx
EXPOSE 8080
