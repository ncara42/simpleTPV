# Spec — Issue #73: Backups automatizados de la base de datos

| Campo  | Valor                            |
| ------ | -------------------------------- |
| Fecha  | 2026-05-29                       |
| Estado | En desarrollo                    |
| Issue  | #73 — `area:infra`, `mvp:week-5` |

## 1. Objetivo

Backups periódicos de PostgreSQL (Semana 5 / HITO A): script `pg_dump` + cron cada
6 h con retención, para tener un punto de recuperación ante fallo de datos.

## 2. Script `infra/scripts/backup-db.sh`

- `pg_dump` en **formato custom** (`-Fc`, comprimido) → restaurable con `pg_restore`
  selectivamente. Nombre con timestamp: `simpletpv-YYYYmmdd-HHMMSS.dump`.
- Configurable por entorno (con defaults para dev):
  - `BACKUP_DIR` (default `./backups`).
  - `RETENTION_DAYS` (default 7) — borra dumps más antiguos.
  - `PG_CONTAINER` (default `simpletpv-postgres`) — si está definido y existe, hace
    `docker exec` sobre el contenedor; si no, usa `pg_dump` directo con `DATABASE_URL`.
  - Credenciales: toma `DATABASE_URL` (superuser) o `POSTGRES_USER`/`POSTGRES_DB`.
- Seguro: `set -euo pipefail`, crea `BACKUP_DIR` si falta, comprueba que el dump no
  quedó vacío (tamaño > 0) antes de rotar los antiguos, código de salida ≠ 0 si falla.
- Idempotente y silencioso salvo errores (apto para cron); registra una línea de
  resumen por ejecución.

## 3. Cron cada 6 h

Documentado en `infra/scripts/README.md`. Dos vías:

- **Host con cron** (VPS clásico):
  `0 */6 * * * BACKUP_DIR=/var/backups/simpletpv RETENTION_DAYS=14 /ruta/backup-db.sh >> /var/log/simpletpv-backup.log 2>&1`
- **Dokploy**: tarea programada (cron) que ejecuta el script en el contexto del
  stack, o un sidecar. Producción debe además replicar los dumps fuera del host
  (S3-compatible) — eso es WAL/offsite de la Semana 6, fuera de este slice.

## 4. Restauración (documentada)

`pg_restore --clean --if-exists -d "$DATABASE_URL" simpletpv-XXigit.dump`. Incluida
en el README para que el procedimiento esté a mano.

## 5. Verificación

El script se prueba **ejecutándolo** contra el Postgres de dev: genera un `.dump`
de tamaño > 0 y aplica la retención. No hay test automatizado de bash en el repo;
la verificación es la ejecución real documentada en el commit.

## 6. Fuera de alcance

- WAL continuo / PITR y replicación offsite a S3 (Semana 6, infra de producción).
- Cifrado de los dumps en reposo (gestión de claves en Dokploy).
