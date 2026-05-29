# Spec — Issue #47: VeriFactu — registro encadenado + cola + adaptador + QR

| Campo      | Valor                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Fecha      | 2026-05-28                                                                                  |
| Estado     | Implementado (con adaptador sandbox)                                                        |
| Issue      | [#47](https://github.com/ncara42/simpleTPV/issues/47) — `area:api`, `area:db`, `mvp:week-4` |
| Blocked by | #8 (venta), #15 (devolución), #28 (Redis)                                                   |

## 1. Objetivo

Cada venta/devolución genera un registro VeriFactu encadenado y se envía a la AEAT (vía proveedor) con cola de reintentos.

## 2. Datos

`VerifactuRecord` (type INVOICE/RECTIFICATION, status PENDING/SENT/FAILED, hash, previousHash, qrData, payload Json, attempts, lastError, sentAt). RLS por tenant.

## 3. Encadenamiento

`computeHash(payload, previousHash)` (función pura): SHA-256 sobre `previousHash|nif|invoiceNumber|date|total|type`. Cada registro encadena con la huella del anterior del tenant → cadena inalterable. `recordFor` lee el último hash con un `pg_advisory_xact_lock` por tenant (serializa el encadenamiento) y crea el registro.

## 4. Cola + adaptador

- **BullMQ** sobre Redis (`REDIS_URL`): `recordFor` encola; el worker procesa con reintentos exponenciales (MAX_ATTEMPTS=5). Sin Redis → envío síncrono (dev/test, una instancia).
- **`VerifactuProvider`** (interfaz) aísla el envío real. `SandboxVerifactuProvider` simula la respuesta (stub). **TODO(prod)**: el envío real requiere un proveedor certificado homologado + credenciales — sustituir el provider en el módulo.
- `processRecord` fija el tenant (AsyncLocalStorage) y actualiza SENT / FAILED + attempts/lastError. Usa `updateMany` con organizationId (robusto bajo RLS FORCE).

## 5. QR

`buildQrData(nif, invoiceNumber, total)` → URL de cotejo AEAT (sandbox host), codificada en el ticket.

## 6. API y conexión

- `GET /verifactu/records?status=`, `POST /verifactu/records/:id/retry` (ADMIN/MANAGER).
- `SalesService.create` genera el INVOICE tras commit (afterCommit, best-effort).

## 7. Decisiones (triage)

- **D47-1 — Adaptador + sandbox.** El envío real a la AEAT necesita credenciales/proveedor que no hay en este entorno; se implementa la interfaz + stub sandbox, listo para enchufar el real.
- **D47-2 — Eventos/registro tras commit.** No se genera el registro si la venta hace rollback.

## 8. Tests

- Unit: `computeHash`/`buildQrData` (determinismo, encadenamiento, inalterabilidad); `recordFor` (encadenado, primer registro null); `processRecord` (SENT, reintento, FAILED); sandbox provider; controller.
- Integración: encadenamiento real de 2 registros (previousHash = hash anterior, ambos SENT en modo síncrono), aislamiento por tenant.
- E2E verificado (API + Redis + BullMQ reales): una venta genera un registro que el worker procesa a SENT con hash + QR.
