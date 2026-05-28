-- Revierte el password hardcodeado introducido en 20260527234721_app_login.
--
-- Motivación (security review finding [MEDIUM], 2026-05-28):
--   El password literal 'app_dev_password' en una migración aplicada por
--   `prisma migrate deploy` deja al rol `app` con credencial conocida en
--   CUALQUIER entorno donde corra la migración — incluida producción.
--   La estrategia "el operador hará ALTER ROLE manualmente antes" es
--   olvidable y no constituye defensa en profundidad.
--
-- Solución:
--   - Esta migración quita el LOGIN/PASSWORD del rol `app`. El rol vuelve
--     a estado NOLOGIN como lo dejó la migración add_rls.
--   - El bootstrap dev (que sí necesita login) vive ahora en
--     `packages/db/scripts/dev-bootstrap.sql`, invocado por docker-compose
--     y por el job E2E del CI tras `prisma migrate deploy`.
--   - En producción, el operador ejecuta `ALTER ROLE app LOGIN PASSWORD
--     '<secret-real>'` UNA VEZ tras el primer migrate deploy, leyendo el
--     secret de Dokploy. Documentado en packages/db/scripts/README.md.

ALTER ROLE app NOLOGIN;
ALTER ROLE app PASSWORD NULL;
