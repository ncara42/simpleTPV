# VeriFactu — Huella oficial, QR y registro de facturación (diseño)

- **Fecha:** 2026-06-22
- **Estado:** Fases 1–3 **implementadas y verificadas**. Transporte a la AEAT (Fase 4)
  y datos de factura completa (Fase 5) **pendientes** (dependen de credenciales /
  decisiones de negocio).
- **Ámbito:** backend Rust (`crates/domain/src/verifactu/`). Sustituye la huella
  _placeholder_ del MVP (issue #47) por el **formato oficial de la AEAT**.

> Regla seguida: **no se ha escrito ningún byte del formato oficial sin una fuente
> oficial de la AEAT delante.** Cada dato de abajo está tomado verbatim de los
> documentos citados y la huella se verifica contra los **vectores oficiales** del PDF.

## Fuentes oficiales (verbatim)

| Documento                                            | Versión             | URL                                                                                                                                            |
| ---------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Especificaciones huella/hash                         | v0.1.2 (27-08-2024) | `https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf` |
| Detalle técnico código QR                            | v0.5.0 (10-12-2025) | `https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf`             |
| Descripción servicios web                            | v1.0.3              | `https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf`                       |
| WSDL `SistemaFacturacion.wsdl`                       | tikeV1.0            | `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl`         |
| XSD `SuministroInformacion.xsd` / `SuministroLR.xsd` | tikeV1.0            | `.../tikeV1.0/cont/ws/SuministroInformacion.xsd`, `.../SuministroLR.xsd`                                                                       |

## Fase 1 — Huella oficial (`hash.rs`)

- **Algoritmo:** SHA-256. **Entrada** codificada en **UTF-8**. **Salida**: hex **en
  MAYÚSCULAS**, 64 caracteres.
- **Cadena del `RegistroAlta`** (orden exacto, `nombre=valor` unidos por `&`):

  ```
  IDEmisorFactura={nif}&NumSerieFactura={serie}&FechaExpedicionFactura={DD-MM-AAAA}&TipoFactura={F1..R5}&CuotaTotal={cuota}&ImporteTotal={importe}&Huella={huella_anterior}&FechaHoraHusoGenRegistro={ISO8601±HH:MM}
  ```

- **Campo vacío/ausente** → solo el nombre y `=` (p. ej. primer registro:
  `…&Huella=&FechaHoraHusoGenRegistro=…`).
- **Cadena del `RegistroAnulacion`**:

  ```
  IDEmisorFacturaAnulada={nif}&NumSerieFacturaAnulada={serie}&FechaExpedicionFacturaAnulada={DD-MM-AAAA}&Huella={huella_anterior}&FechaHoraHusoGenRegistro={ISO8601±HH:MM}
  ```

- **Vectores oficiales usados como test** (PDF huella v0.1.2):
  - Alta (Caso 2) → `F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97`
  - Anulación (Caso 3) → `177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68`
- **Implementación:** `compute_alta_hash` / `compute_anulacion_hash`.
  **Tests:** `alta_hash_vector_oficial_aeat`, `anulacion_hash_vector_oficial_aeat`.

### Formato de fechas

- Ambas fechas se anclan a **`Europe/Madrid`** (DST correcto vía `time-tz`,
  mismo idioma que `receipt.rs`): la `FechaExpedicionFactura` es la **fecha fiscal
  del negocio**, no UTC (una venta de madrugada en UTC caería el día anterior).
- `FechaExpedicionFactura`: `DD-MM-AAAA` (`format_fecha_expedicion`).
- `FechaHoraHusoGenRegistro`: ISO 8601 con huso español `+01:00`/`+02:00`
  (`format_fecha_hora_huso`).

## Fase 2 — QR oficial (`build_qr_data`)

- **URLs de cotejo:** producción `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR`,
  pruebas `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`. Configurable con la env
  **`AEAT_COTEJO_URL`**. (Antes el default `www2.aeat.es` no era el oficial.)
- **Parámetros (orden exacto):** `nif`, `numserie`, `fecha` (`DD-MM-AAAA`), `importe`.
  Codificación URL en UTF-8 (`&` → `%26`, etc.).
- **QR físico (norma):** ISO/IEC 18004:2015, tamaño 30×30–40×40 mm, corrección de
  errores **nivel M**, zona de silencio ≥ 2 mm. → revisar que la impresión ESC/POS
  (`apps/*/lib/escpos`) respete tamaño y nivel de corrección.

## Fase 3 — Registro + desglose de IVA (`record.rs`)

- **Mapeo de tipos oficiales:**
  - Venta (ticket) = **factura simplificada → `TipoFactura` `F2`**.
  - Devolución/abono = **rectificativa de simplificada → `TipoFactura` `R5`**, importes
    en **negativo**. Es un `RegistroAlta` (no una anulación).
- **`CuotaTotal`** = Σ de cuotas del desglose de IVA, reutilizando
  `sales::build_tax_breakdown` (base + cuota por tipo, con el descuento de ticket
  prorrateado). Threaded desde `sales::service` y `returns::service` (con y sin ticket).
- **Payload** (`VerifactuRecord.payload`, JSONB): campos del `RegistroAlta`
  (`idEmisorFactura`, `numSerieFactura`, `fechaExpedicionFactura`, `tipoFactura`,
  `cuotaTotal`, `importeTotal`, `fechaHoraHusoGenRegistro`, `huellaAnterior`, `huella`)
  - `desglose[]` con nombres de elemento del XSD `DetalleType`: `impuesto` (`01` = IVA),
    `tipoImpositivo`, `baseImponibleOimporteNoSujeto`, `cuotaRepercutida`. Así la capa de
    envío puede construir el XML y **re-verificar la huella**.

## Fase 4 — Transporte a la AEAT (PENDIENTE, gated)

Datos del WSDL (para implementarla):

- **Operación de alta:** `RegFactuSistemaFacturacion` (raíz del body `sum:RegFactuSistemaFacturacion`). Consulta: `ConsultaFactuSistemaFacturacion`.
- **Namespace** (no navegable): `…/aeat/tike/cont/ws/SistemaFacturacion.wsdl`.
- **Endpoints `sfVerifactu`:** prod `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (+ `www10`); pruebas `https://prewww1.aeat.es/...` (+ `prewww10`). SOAP 1.1.

**Bloqueado por** (no es código):

- **Certificado electrónico** de la empresa/apoderado para la conexión mTLS, **o**
  contratación de un **proveedor homologado** (su API). → no se fabrica aquí (sería
  inventar) ni hay credenciales en este entorno.
- **Declaración responsable** del software (acto legal de la empresa).
- Construcción del **XML `RegistroAlta`** conforme al XSD: no se escribe a ciegas
  porque no es verificable sin el validador oficial / la conexión de pruebas.

Mientras tanto, `SandboxProvider` sigue siendo el `VerifactuProvider` por defecto.

## Fase 5 — Datos pendientes

- **NIF/razón social del cliente** para **factura completa (`F1`)**: hoy solo se
  emiten tickets `F2` (simplificada), que no lo exigen. Requiere campo en `Sale` +
  captura en TPV.
- **`RegistroAnulacion`** de ventas `VOIDED`: la huella (`compute_anulacion_hash`) ya
  está lista; falta emitir el registro en el flujo de anulación.
- **QR de rectificativo (abono)**: hoy el QR lleva el `ImporteTotal` negativo (coherente
  con el registro). La spec QR v0.5.0 no define el cotejo de importes negativos →
  confirmar con la AEAT si debe usarse el absoluto o no generarse en el abono.

## Verificación

- Vectores oficiales AEAT: `cargo test -p simpletpv-domain --lib verifactu::hash` ✓.
- Integración (Postgres): `verifactu_invoice`, `verifactu_queue`,
  `verifactu_rectification` ✓; `sales_*`, `returns_*` sin regresión ✓.
- `cargo clippy -D warnings` y `cargo fmt --check` limpios.

## Plazos legales

Obligatorio **1-ene-2027** (Impuesto sobre Sociedades) / **1-jul-2027** (resto).
