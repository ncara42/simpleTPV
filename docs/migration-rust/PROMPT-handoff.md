# Prompt de arranque — handoff de la migración a Rust (marcogmurciano)

> Pega el bloque de abajo al iniciar una sesión nueva para continuar la
> migración del backend NestJS → Rust. Mantén sincronizado con
> [`HANDOFF.md`](./HANDOFF.md) y con la EPIC de seguimiento (issue #158).

```
Continúo (como marcogmurciano) la migración del backend NestJS → Rust de
simpleTPV. Lee primero docs/migration-rust/HANDOFF.md y mi EPIC de seguimiento
(issue #158), que tiene el índice de todas las issues del handoff (#152–#159).

DE DÓNDE VIENE EL CÓDIGO (paso 0, importante):
Todo el trabajo Rust se desarrolló en el repo ncara42/simpleTPV (mi origin es
ncara42; yo soy upstream). En MI repo puede que aún no esté. Antes de nada,
sincroniza:
- Añade ncara42 como remoto si no lo tienes:
    git remote add ncara https://github.com/ncara42/simpleTPV.git
    git fetch ncara
- Trae a mi `main` todo lo ya mergeado en ncara/main (Fase 0/1, http auth,
  núcleo Fase 2). Revisa el diff antes de integrar.
- La devolución ciega (EN CURSO) está en ncara, rama feat/rust-fase2-returns-blind
  (PR ncara42#176) — mi issue #159. Trae esa rama y ábrela como PR contra mi main.

ESTADO (en ncara/main, a integrar en el mío): workspace Cargo en crates/
{shared,db,auth,domain,http,app} (Rust 1.96). Hecho: Fase 0 (RLS,
db::with_tenant_tx), Fase 1 (auth JWT HS256 interop NestJS + bcrypt + rotación
refresh), capa http de auth (AuthUser con revalidación A-04, /auth/*, cookies,
rate-limit, CORS fail-fast, cabeceras seguridad) y todo el núcleo transaccional
de Fase 2: products (CRUD+import CSV), stock (ajustes/mínimos/recuento, lotes
FEFO, alertas, vistas dashboard), sales (idempotencia clientId, caja OPEN,
totales/descuentos, contador ticket atómico, void), returns (con ticket + ciega).

PRIMER TRABAJO TRAS SINCRONIZAR: revisar (security-reviewer + rust-reviewer) y
mergear la devolución ciega (#159 / PR #176). Verde antes de mergear.

DESPUÉS, en orden, según mis issues:
1. Fase 2 restante (#152): recibos/ticket HTML, exports CSV, desglose IVA
   (buildTaxBreakdown), totales/márgenes del listado de ventas, VeriFactu +
   feature flags (incl. flag blind_returns y VeriFactu rectificativo de la
   devolución ciega).
2. Fase 3 Operaciones (#153) · Fase 4 Plataforma+SSE (#154) ·
   Fase 5 Integraciones (#155) · Fase 6 Corte/strangler (#156).
3. Decisión pendiente store-scope en lecturas (#157).

REGLAS (no negociables):
- Toda decisión técnica desde fuentes oficiales vía Context7. Nada inventado.
- Port fiel del comportamiento NestJS (apps/api). Antes de implementar, lee el
  módulo NestJS equivalente y PORTA sus tests de integración (TDD).
- RLS multi-tenant en un único punto: db::with_tenant_tx (fail-safe).
- Dinero siempre Decimal (nunca float). JSON camelCase con paridad Prisma
  (Decimal→string normalizado, fechas ISO-8601). Secretos en SecretString,
  nunca en logs.
- Cada slice: research Context7 → portar tests → implementar →
  cargo clippy --all-targets -- -D warnings + cargo fmt --check → revisión
  (security + rust-reviewer) → commit Conventional Commits → rama por slice → PR.
- El esquema lo gestiona Prisma Migrate; SQLx solo consume.
- Prosa, comentarios y commits en español de España.

Entorno de pruebas (Postgres docker host :5434):
  docker compose up -d postgres
  pnpm --filter @simpletpv/db exec prisma migrate deploy
  pnpm --filter @simpletpv/db db:bootstrap-dev
  pnpm --filter @simpletpv/db db:seed
  cd crates && . "$HOME/.cargo/env" && cargo test --workspace

Nota CI: "OSV Scanner (pnpm-lock)" falla pero es informativo y preexistente
(vuln transitiva hono vía @prisma/dev, ya en main); los checks que importan son
"Lint, typecheck, tests y build" + "E2E smoke".

Empieza por el paso 0 (sincronizar el código Rust desde ncara42), luego revisa
y mergea #159/PR #176, y sigue por #152.
```
