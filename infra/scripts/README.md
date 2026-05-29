# `infra/scripts/`

Scripts de operación de infraestructura. No forman parte del build de la app;
se invocan desde cron o manualmente en el servidor.

## `backup-db.sh`

Backup de la base de datos PostgreSQL (#73). Genera un dump en **formato custom
comprimido** (`pg_dump -Fc`, restaurable con `pg_restore`) y aplica retención.

Detecta el entorno automáticamente:

- Si existe un contenedor docker llamado `simpletpv-postgres` (configurable con
  `PG_CONTAINER`), vuelca con `docker exec`.
- Si no, usa `pg_dump` directo con `DATABASE_URL`.

### Variables de entorno

| Variable         | Default              | Descripción                             |
| ---------------- | -------------------- | --------------------------------------- |
| `BACKUP_DIR`     | `./backups`          | Directorio destino de los dumps.        |
| `RETENTION_DAYS` | `7`                  | Borra dumps con más de N días.          |
| `PG_CONTAINER`   | `simpletpv-postgres` | Contenedor docker (modo `docker exec`). |
| `DATABASE_URL`   | —                    | Conexión (superuser) para el modo host. |
| `POSTGRES_USER`  | `postgres`           | Usuario (modo contenedor).              |
| `POSTGRES_DB`    | `simpletpv`          | Base de datos a volcar.                 |

### Uso

```bash
# Local (usa el contenedor de docker compose):
./infra/scripts/backup-db.sh

# Con directorio y retención personalizados:
BACKUP_DIR=/var/backups/simpletpv RETENTION_DAYS=14 ./infra/scripts/backup-db.sh
```

### Cron — cada 6 horas

**VPS / host con cron clásico:**

```cron
0 */6 * * * BACKUP_DIR=/var/backups/simpletpv RETENTION_DAYS=14 \
  /ruta/a/simpletpv/infra/scripts/backup-db.sh >> /var/log/simpletpv-backup.log 2>&1
```

**Dokploy:** crear una tarea programada (cron) con la expresión `0 */6 * * *` que
ejecute este script en el contexto del stack. En producción, además, los dumps
deben replicarse **fuera del host** (almacenamiento S3-compatible) — eso es parte
del WAL/offsite de la Semana 6, no de este script.

### Restauración

```bash
# Listar el contenido de un dump (verificar integridad):
pg_restore --list simpletpv-YYYYmmdd-HHMMSS.dump

# Restaurar sobre una BD (¡destruye y recrea objetos!):
pg_restore --clean --if-exists -d "$DATABASE_URL" simpletpv-YYYYmmdd-HHMMSS.dump

# Desde el contenedor de dev:
docker exec -i simpletpv-postgres pg_restore --clean --if-exists \
  -U postgres -d simpletpv < simpletpv-YYYYmmdd-HHMMSS.dump
```

> El script verifica que el dump no quede vacío **antes** de aplicar la retención,
> de modo que un fallo de `pg_dump` nunca borra los backups buenos anteriores.
