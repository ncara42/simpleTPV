# syntax=docker/dockerfile:1
# Servidor MCP SimpleTpv (OAuth 2.1, remoto multi-tenant).
# Build desde la raíz del monorepo:
#   docker build -f packages/mcp/Dockerfile -t simpletpv-mcp .
# Depende de @simpletpv/ui (solo en build: se bundlea en la UI de MCP Apps con
# Vite; en runtime el HTML ya va dentro de dist/ui).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ─── Dependencias (incluye dev: Vite/React/@simpletpv/ui para el bundle) ───────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @simpletpv/mcp...

# ─── Build (vite build:ui → dist/ui + tsc → dist) ─────────────────────────────
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/ui packages/ui
COPY packages/mcp packages/mcp
RUN pnpm --filter @simpletpv/mcp run build

# ─── Solo dependencias de producción (sin Vite/React/@simpletpv/ui devDeps) ────
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter @simpletpv/mcp...

# ─── Runner (no-root) ────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_BIND=0.0.0.0
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/mcp/node_modules ./packages/mcp/node_modules
COPY --from=builder /repo/packages/mcp/dist ./packages/mcp/dist
COPY packages/mcp/package.json ./packages/mcp/
USER node
EXPOSE 8766
CMD ["node", "packages/mcp/dist/index.js"]
