# Spec — Caja obligatoria para cobrar (revierte decisión de #13)

| Campo    | Valor                                                                |
| -------- | -------------------------------------------------------------------- |
| Fecha    | 2026-05-28                                                           |
| Estado   | Aprobado para implementación                                         |
| Contexto | Cambia la decisión "caja opcional" de la issue #13 a **obligatoria** |

## 1. Objetivo

`POST /sales` exige que haya una sesión de caja (`CashSession`) **abierta** para la tienda de la venta. Sin caja abierta, la venta se rechaza. Invierte la decisión previa de #13 (caja opcional).

## 2. Alcance

- **API:** `POST /sales` valida que exista una `CashSession` con `status=OPEN` para `dto.storeId` del tenant. Si no → `ConflictException` (409, "No hay caja abierta en esta tienda").
- **NO** se liga la venta a la sesión (no se añade `Sale.cashSessionId`). El cuadre sigue calculándose por ventana temporal del turno (sin cambios en cash-sessions).
- **Tests:** integración y E2E de ventas abren una caja antes de crear ventas. Nuevo test: vender sin caja → 409.
- **TPV:** botón "Cobrar" deshabilitado si no hay caja abierta para la tienda activa, con aviso "Abre la caja para poder cobrar".
- **Docs:** actualizar el spec de #13 (sección "caja opcional") para reflejar que ahora es obligatoria.

## 3. API

En `sales.service.create`, al principio (tras `requireTenant`), antes de procesar líneas:

```ts
const openSession = await this.prisma.cashSession.findFirst({
  where: { storeId: dto.storeId, organizationId: tenant.organizationId, status: 'OPEN' },
});
if (!openSession) {
  throw new ConflictException('No hay caja abierta en esta tienda');
}
```

- Usa el cliente extendido (RLS lo aísla por tenant). 409 es el código correcto (estado del recurso incompatible con la acción).
- El resto de `create` no cambia.

## 4. TPV

- `CashPanel`/`SalePage` ya consultan `currentCashSession(activeStore)`. Exponer ese estado al `CartPanel` (prop `cashOpen: boolean`).
- En `CartPanel`, el botón "Cobrar" se deshabilita si `!cashOpen` (además de las condiciones actuales: carrito vacío, sin tienda). Mostrar un aviso junto al botón: "Abre la caja para poder cobrar" cuando `!cashOpen`.
- Si el backend devuelve 409 (carrera: caja cerrada entre la comprobación y el cobro), mostrar el mensaje del servidor sin perder el carrito.

## 5. Tests

- Integración (`sales.integration.spec.ts`): el helper que crea ventas abre una `CashSession` para la tienda antes (o se añade un helper `ensureOpenSession(storeId)`). Nuevo caso: `create` sin caja abierta → ConflictException. Los tests de descuentos/ticket/void/historial que crean ventas también necesitan caja abierta — revisar todos.
- E2E (`checkout.spec.ts`): abrir caja antes de cobrar (o el seed/flujo deja una caja abierta). Verificar que el flujo sigue verde.
- Unit (`sales.service.spec.ts`): mockear `cashSession.findFirst` → null lanza Conflict; → sesión OK continúa. Mantener cobertura sobre el floor del ratchet.

## 6. Riesgo

Este cambio toca el camino de venta que usan #9-#15. Hay que revisar que TODOS los tests que crean ventas (no solo sales.integration) abran caja: descuentos, ticket, void, historial, devoluciones. Si alguno crea ventas sin caja, fallará con 409.
