-- F3 necesita que el rol `app` (creado en add_rls con NOLOGIN) pueda
-- conectarse desde la aplicación. Le damos LOGIN y contraseña de desarrollo.
-- En producción Dokploy sobrescribirá la contraseña vía ALTER ROLE con
-- secret antes del despliegue inicial.

ALTER ROLE app LOGIN PASSWORD 'app_dev_password';
