# syntax=docker/dockerfile:1
# Build desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t simpletpv-api .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ---- deps: instala todo el workspace con cache de store ----
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

# ---- builder: genera Prisma client + compila la API ----
FROM deps AS builder
COPY . .
RUN pnpm --filter @simpletpv/db run build
RUN pnpm --filter @simpletpv/api run build
# Poda a dependencias de producción del workspace api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @simpletpv/api deploy --legacy --prod /app

# ---- runner: imagen mínima de runtime ----
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/packages/db/generated ./node_modules/@simpletpv/db/generated
# Corre como el usuario `node` (no root) que ya trae la imagen oficial.
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
