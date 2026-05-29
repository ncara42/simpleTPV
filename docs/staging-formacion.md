# Entorno de formación — datos demo en staging (#83)

## Poblar staging

Con `DATABASE_URL` apuntando a la base de datos de **staging** (NUNCA producción):

```bash
DATABASE_URL="postgresql://<user>:<pass>@<host-staging>:5432/simpletpv?schema=public" \
  pnpm --filter @simpletpv/db db:seed:demo
```

El seed es **idempotente**: se puede re-ejecutar antes de cada formación sin
duplicar datos (verificado: dos ejecuciones seguidas producen los mismos
conteos). Tiene una guarda que **aborta si `NODE_ENV=production`**.

## Qué crea

- **Organización:** "Tienda Demo Formación" (NIF `B99999999`).
- **2 tiendas:** Tienda Demo Centro (`01`), Tienda Demo Norte (`02`).
- **Catálogo:** 4 familias, 25 productos (con precios, coste, código de barras),
  stock variado — algunos por debajo del mínimo para practicar alertas.
- **Histórico:** ~45 días de ventas, sesiones de caja (una abierta hoy por tienda)
  y movimientos de stock, para que los dashboards de KPIs muestren datos.

## Credenciales demo

Todos los usuarios usan la contraseña **`demo1234`**:

| Email                    | Rol     |
| ------------------------ | ------- |
| `admin@demo.simpletpv`   | ADMIN   |
| `manager@demo.simpletpv` | MANAGER |
| `clerk@demo.simpletpv`   | CLERK   |

Son credenciales de **staging con datos ficticios**, no de producción.

## Notas operativas

- Las fechas del histórico son **relativas al día en que se ejecuta el seed**, de
  modo que "ventas de hoy" siempre tiene datos. Conviene re-ejecutarlo el mismo
  día de cada sesión de formación para que los KPIs del día estén poblados.
- El seed cierra automáticamente cualquier sesión de caja que quedara abierta de
  una ejecución anterior antes de abrir la del día en curso, así que re-ejecutarlo
  en días distintos no da error.

## Checklist físico de la tienda (parte no-software de #83)

- [ ] Router 4G de respaldo instalado y operativo en cada tienda piloto.
- [ ] Probada la conmutación a 4G ante caída de la línea principal.
