#!/usr/bin/env bash
#
# backup-db.sh — Backup de la base de datos PostgreSQL de simpleTPV (#73).
#
# Genera un dump en formato custom comprimido (pg_dump -Fc), restaurable con
# pg_restore, y aplica retención borrando los dumps más antiguos. Pensado para
# correr por cron cada 6 h. Apto tanto en dev (contenedor docker) como en un host.
#
# Variables de entorno (con defaults para desarrollo):
#   BACKUP_DIR      Directorio destino de los dumps.   (default: ./backups)
#   RETENTION_DAYS  Días de retención; borra más viejos.(default: 7)
#   PG_CONTAINER    Si está definido y el contenedor existe, usa `docker exec`.
#                                                       (default: simpletpv-postgres)
#   DATABASE_URL    Cadena de conexión (superuser). Usada en modo host (sin contenedor).
#   POSTGRES_USER   Usuario para el modo contenedor.   (default: postgres)
#   POSTGRES_DB     Base de datos a volcar.            (default: simpletpv)
#
# Uso:
#   ./infra/scripts/backup-db.sh
#   BACKUP_DIR=/var/backups/simpletpv RETENTION_DAYS=14 ./infra/scripts/backup-db.sh
#
# Cron (cada 6 h):
#   0 */6 * * * BACKUP_DIR=/var/backups/simpletpv RETENTION_DAYS=14 \
#     /ruta/a/infra/scripts/backup-db.sh >> /var/log/simpletpv-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
PG_CONTAINER="${PG_CONTAINER:-simpletpv-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-simpletpv}"

timestamp="$(date +%Y%m%d-%H%M%S)"
outfile="${BACKUP_DIR}/simpletpv-${timestamp}.dump"

log() { echo "[backup-db] $(date +%Y-%m-%dT%H:%M:%S) $*"; }
fail() { echo "[backup-db] ERROR: $*" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# Decide el modo: si hay un contenedor docker con ese nombre corriendo, usa
# `docker exec`; si no, usa pg_dump directo con DATABASE_URL.
use_container=false
if [ -n "$PG_CONTAINER" ] && command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    use_container=true
  fi
fi

if [ "$use_container" = true ]; then
  log "Volcando '${POSTGRES_DB}' desde el contenedor '${PG_CONTAINER}' → ${outfile}"
  # -Fc: formato custom comprimido. Escribe a stdout y lo redirigimos al fichero.
  docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
    > "$outfile" || fail "pg_dump (contenedor) falló"
else
  [ -n "${DATABASE_URL:-}" ] || fail "Sin contenedor '${PG_CONTAINER}' y sin DATABASE_URL: no sé a qué BD conectar"
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump no está instalado en el host"
  log "Volcando vía DATABASE_URL → ${outfile}"
  pg_dump "$DATABASE_URL" -Fc > "$outfile" || fail "pg_dump (host) falló"
fi

# Verifica que el dump no quedó vacío ANTES de rotar (no borres backups buenos si
# el nuevo está corrupto/vacío).
if [ ! -s "$outfile" ]; then
  rm -f "$outfile"
  fail "El dump quedó vacío; abortando sin tocar la retención"
fi

size="$(du -h "$outfile" | cut -f1)"
log "Backup OK: ${outfile} (${size})"

# Retención: borra dumps con más de RETENTION_DAYS días.
deleted="$(find "$BACKUP_DIR" -name 'simpletpv-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
if [ "$deleted" != "0" ]; then
  log "Retención: borrados ${deleted} dump(s) con más de ${RETENTION_DAYS} días"
fi

log "Hecho."
