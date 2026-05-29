# Diseño — Seed de datos demo para staging/formación (#83)

- **Semana:** 6 (Despliegue piloto + Estabilización)
- **Fecha:** 2026-05-29
- **Issue:** ncara42/simpleTPV#83 (parte de código: entorno de práctica con datos demo)
- **Área:** db / ops

## Contexto y alcance

La issue #83 pide preparar el entorno de formación (datos demo en staging) y
verificar el router 4G de respaldo en cada tienda. El **router 4G es hardware
físico** (fuera del alcance de código). La parte automatizable es el **seed de
datos demo** que puebla staging para que el personal practique sin tocar
producción.

El seed actual (`packages/db/prisma/seed.ts`) es **mínimo y contractual para los
tests/CI**: 2 organizaciones con NIFs y UUIDs de tienda fijos (`B11111111`,
`B22222222`), 3 usuarios `.test` por org, 5 productos, stock plano de 100, sin
familias, sin ventas. Los tests de integración dependen de esos identificadores,
así que **no se toca**.

Este diseño añade un seed demo **independiente**.

## Decisiones (acordadas en brainstorming)

1. **Seed separado**, no extender el de tests: fichero nuevo `seed-demo.ts` +
   script `db:seed:demo`. No modifica `seed.ts`.
2. **Datos completos y realistas**: catálogo con familias, stock variado e
   histórico de actividad para que todos los dashboards de KPIs muestren datos.
3. **Credenciales demo fijas y documentadas** (es staging con datos ficticios).

## Arquitectura

```
packages/db/prisma/seed-demo.ts   → seed demo (1 org realista + histórico)
packages/db/package.json          → script "db:seed:demo": "tsx prisma/seed-demo.ts"
docs/staging-formacion.md         → guía: poblar staging + credenciales + checklist 4G
```

Sigue el patrón del seed actual: `dotenv/config`, adapter `PrismaPg` con
`process.env.DATABASE_URL`, cliente de `../generated/client/index.js`, `bcryptjs`
para passwords, idempotencia por `upsert` sobre claves naturales. Corre como
superuser (BYPASSRLS), igual que el seed de tests.

## Datos generados

Una **organización demo** con NIF propio `B99999999` ("Tienda Demo Formación"),
que no colisiona con las orgs de tests.

- **2 tiendas**: "Tienda Demo Centro" (code `01`), "Tienda Demo Norte" (code `02`).
- **Usuarios** (password demo fija documentada), con `UserStore` asignados:
  - `admin@demo.simpletpv` (ADMIN), `manager@demo.simpletpv` (MANAGER),
    `clerk@demo.simpletpv` (CLERK).
- **3-4 familias jerárquicas** (p.ej. Flores, Aceites, Cosmética, Accesorios) con
  `color`, `icon`, `sortOrder`.
- **~25 productos** repartidos en familias, con `salePrice`, `costPrice` (para el
  dashboard de márgenes), `taxRate`, `barcode` y `saleUnit` variados (algunos por
  peso). Precios y nombres realistas del sector.
- **Stock por tienda**: la mayoría con cantidad normal; **algunos por debajo de
  `minStock`** (y alguno a 0) para que se generen alertas de stock bajo / agotado
  visibles en los dashboards.
- **Histórico de ~45 días**: ventas (`Sale` + `SaleLine`, mezcla CASH/CARD), unas
  pocas devoluciones (`Return` + `ReturnLine`), `StockMovement` coherentes, y
  `CashSession` abiertas/cerradas. Volumen moderado (~5-15 ventas/día/tienda) para
  que los KPIs (ventas hoy, por familia, márgenes, rankings, agotados) tengan
  datos sin inflar la BD.

## Generación determinista del histórico

- Las fechas se calculan **relativas a la fecha de ejecución** (`hoy - N días`),
  para que "ventas de hoy" tenga datos siempre que se ejecute antes de una sesión
  de formación. Se usa `new Date()` al arrancar el seed (Node vía `tsx`, sin las
  restricciones del entorno de scripts del agente).
- **Reproducibilidad e idempotencia**: el seed usa un **PRNG con semilla fija**
  (no `Math.random()`) para elegir productos, cantidades y horas. Combinado con
  ticketNumbers deterministas (`<storeCode>-<YYYYMMDD>-<NNN>`) como clave natural,
  re-ejecutar produce el mismo histórico y los `upsert` no duplican.
- El stock final de cada producto/tienda se calcula **coherente** con los
  movimientos sembrados (stock inicial − vendido + devuelto), no un número
  arbitrario que contradiga el histórico.

## Idempotencia y seguridad

- Todo por `upsert` / claves naturales: NIF (org), email (user), `(orgId, code)`
  (store), `(orgId, ticketNumber)` (sale), `(productId, storeId)` (stock). Igual
  patrón que el seed de tests. Re-ejecutar no duplica.
- **Guarda de seguridad**: el seed demo aborta con error si
  `process.env.NODE_ENV === 'production'` — es para staging, nunca para la BD del
  piloto. Datos 100% ficticios.
- **Credenciales**: password demo fija (constante en el fichero, p.ej. `demo1234`),
  documentada en la guía. Aceptable: staging con datos ficticios, no producción.

## Estructura del fichero (decomposición)

`seed-demo.ts` se organiza en funciones con una responsabilidad cada una, para
mantenerlo legible (el seed de tests es un único bloque, pero este es más grande):

- `assertNotProduction()` — guarda de seguridad.
- `seedCatalog(orgId)` — familias + productos + stock inicial variado.
- `seedUsers(orgId, passwordHash)` — usuarios + UserStore.
- `seedHistory(orgId, stores, products)` — genera ventas/devoluciones/cajas/movimientos
  deterministas de los últimos ~45 días y ajusta el stock final.
- `seededRandom(seed)` — PRNG simple (mulberry32 o LCG) para determinismo.
- `main()` — orquesta: guarda, crea org, llama a las anteriores, log de resumen.

Si el fichero creciera demasiado, la generación de histórico puede moverse a un
`seed-demo-history.ts`; se decide en el plan según tamaño.

## Documentación

`docs/staging-formacion.md`:

- Cómo poblar staging: `pnpm --filter @simpletpv/db db:seed:demo` con
  `DATABASE_URL` apuntando a la BD de staging.
- Org/tiendas/usuarios que crea y las **credenciales demo**.
- Nota de que es idempotente (se puede re-ejecutar antes de cada formación).
- Recordatorio de que NO debe ejecutarse contra producción (la guarda lo impide).
- **Checklist físico (tuyo)**: verificar el router 4G de respaldo instalado y
  operativo en cada tienda piloto (parte no-código de #83).

## Testing y verificación

Verificación con Postgres efímero (Docker disponible), no unit tests al uso:

1. Levantar Postgres limpio + aplicar migraciones (`prisma migrate deploy`).
2. Ejecutar el seed demo (`DATABASE_URL` al Postgres efímero).
3. Verificar conteos: 1 org demo, 2 tiendas, 3 usuarios, ~25 productos, familias,
   stock con algún registro bajo `minStock`, y ventas en el histórico (incluida
   al menos una con fecha de hoy → "ventas hoy" no vacío).
4. **Idempotencia**: ejecutar el seed **dos veces** y confirmar que los conteos
   no cambian (mismos números).
5. **Gate del monorepo**: lint + typecheck + build verdes. El seed de tests y los
   E2E NO se tocan → no se ven afectados (se confirma que `pnpm --filter
@simpletpv/api test` sigue en 328 verdes).

## Fuera de alcance (YAGNI)

- Router 4G y cualquier verificación de hardware (físico, tuyo).
- Datos de VeriFactu en el histórico (no necesario para la práctica de venta/stock;
  añade complejidad de encadenamiento de hash). Se omite.
- Traspasos y compras en el histórico (los dashboards de la Semana 5 no dependen
  de ellos; el foco es venta/stock/caja/márgenes). Se pueden añadir luego.
- Anonimización de datos reales: el seed genera datos **ficticios** desde cero, no
  anonimiza datos reales.

## Criterios de aceptación (de la issue)

- [ ] Entorno de práctica disponible y poblado (este seed, ejecutado contra staging).
- [ ] Redundancia de conectividad (4G) verificada en cada tienda (físico, tuyo —
      documentado como checklist en la guía).
