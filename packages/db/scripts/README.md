# `packages/db/scripts/`

Scripts SQL que **NO son migraciones** de Prisma. Las migraciones aplican
schema y políticas RLS. Estos scripts hacen bootstrap operacional (passwords,
datos de prueba, etc.) y se invocan explícitamente, no automáticamente.

## `dev-bootstrap.sql`

Da al rol `app` (creado en la migración `add_rls` como NOLOGIN) un password
conocido `'app_dev_password'` para que la API y los tests integration/E2E
puedan conectarse.

### Uso

**Local:**

```bash
pnpm --filter @simpletpv/db db:bootstrap-dev
```

**CI (job E2E):** invocado tras `prisma migrate deploy` y antes del seed.

**Producción:** NO USAR este script. El operador ejecuta una vez tras el
primer despliegue:

```sql
ALTER ROLE app LOGIN PASSWORD '<secret-real-leído-de-dokploy>';
```

### Por qué no es una migración Prisma

Si el bootstrap viviera en una migración (como hacía la versión anterior,
`20260527234721_app_login`, ahora revertida por `20260528001929_remove_app_password`),
`prisma migrate deploy` lo aplicaría en **todos los entornos** incluido producción
— dejando el rol con password conocido en prod. La separación migración / script
de bootstrap garantiza que prod nunca recibe el password de dev.
