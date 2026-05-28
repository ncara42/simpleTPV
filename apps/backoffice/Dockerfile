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
COPY . .
RUN pnpm --filter @simpletpv/backoffice run build

FROM nginx:1.27-alpine AS runner
ENV API_URL=http://simpletpv-api:3001
COPY --from=builder /repo/apps/backoffice/dist /usr/share/nginx/html
COPY apps/backoffice/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
