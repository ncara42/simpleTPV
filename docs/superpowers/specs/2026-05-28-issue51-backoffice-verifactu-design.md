# Spec — Issue #51: Backoffice — panel de salud VeriFactu

| Campo      | Valor                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                              |
| Estado     | Implementado                                                                            |
| Issue      | [#51](https://github.com/ncara42/simpleTPV/issues/51) — `area:backoffice`, `mvp:week-4` |
| Blocked by | #47 (VeriFactu)                                                                         |

## 1. Objetivo

Panel de administración del estado de VeriFactu: cola de envíos, fallos y reintentos.

## 2. UI (pestaña VeriFactu)

- Contadores de pendientes y fallidos (badges).
- Filtro por estado (Todos/Pendientes/Enviados/Fallidos).
- Tabla de `VerifactuRecord` con fecha, tipo, estado (semáforo) + lastError, intentos.
- Acción **Reintentar** en los FAILED (`POST /verifactu/records/:id/retry`).
- Refresco con polling cada 5s (el envío es asíncrono por la cola).

Reutiliza `@simpletpv/auth` (tipos VeriFactu), `lib/verifactu.ts`. React Query + catalog.css.

## 3. Tests

- No rompe los testids/E2E existentes (access.spec 2/2).
- Verificado en navegador (Playwright + API + Postgres): lista con contadores, filtro por FAILED, reintentar saca el registro de FAILED (pasa a PENDING). Sin errores de consola.
