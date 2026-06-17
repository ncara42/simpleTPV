# syntax=docker/dockerfile:1
#
# Imagen del backend Rust de simpleTPV (binario `simpletpv-api`). Fase 6 (#156).
# Build desde el directorio del workspace (`crates/`):
#
#   docker build -f crates/Dockerfile -t simpletpv-api-rust crates/
#
# El esquema lo sigue gestionando Prisma Migrate (doc 04 §5): este contenedor NO
# aplica migraciones — SQLx solo consume. Durante el corte strangler las aplica
# NestJS (o un job de migración) — ver docs/migration-rust/10-corte-produccion.md.

# ---- builder: compila el binario en release (lto=thin/strip/codegen-units=1
#      ya vienen del perfil [profile.release] del workspace) ----
FROM rust:1.96-slim-bookworm AS builder
WORKDIR /build
COPY . .
# Cache de registry y de target entre builds; el binario se copia FUERA del
# montaje de cache (que no se persiste en la capa) en el mismo RUN.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --locked --bin simpletpv-api \
    && cp target/release/simpletpv-api /usr/local/bin/simpletpv-api

# ---- runtime: debian-slim mínimo. CA certs para TLS (rustls: sqlx/redis/sentry
#      sobre rediss/HTTPS) y curl para el HEALTHCHECK. ----
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# Usuario sin privilegios (no root).
RUN useradd --system --no-create-home --uid 10001 appuser
COPY --from=builder /usr/local/bin/simpletpv-api /usr/local/bin/simpletpv-api
USER appuser
# El binario lee BIND_ADDR de la config (fail-fast). En contenedor escucha en
# todas las interfaces; el resto de secretos/URLs los inyecta Dokploy.
ENV BIND_ADDR=0.0.0.0:3001
EXPOSE 3001
# Liveness contra /health. La readiness (/ready, comprueba la BD) la consulta el
# orquestador/proxy del corte.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001/health || exit 1
ENTRYPOINT ["/usr/local/bin/simpletpv-api"]
