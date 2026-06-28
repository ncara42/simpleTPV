# VERI\*FACTU — Plan de cierre de implementación (estado + qué falta)

- **Fecha:** 2026-06-28
- **Autor:** revisión técnico-legal (código + fuentes oficiales AEAT/BOE verificadas)
- **Ámbito:** backend Rust (`crates/`), recibo (`crates/domain/src/receipt.rs`), TPV/backoffice (`apps/`).
- **Objetivo:** completar VERI\*FACTU de la forma **más sencilla, legal y barata** para el
  desarrollador (nosotros) y para el comercio (usuario final), partiendo de lo ya implementado.

> **Regla de oro (heredada de la spec previa):** ni un byte del formato oficial sin una
> fuente oficial delante. Toda fecha y obligación de este plan está verificada contra el
> BOE o el portal de desarrolladores de la AEAT (ver §11). La spec
> `2026-06-22-verifactu-huella-oficial-design.md` queda **parcialmente desactualizada**:
> daba F1 y `RegistroAnulacion` por pendientes, pero el código del 23-jun ya los implementa
> (§3). Sus plazos «2027» sí eran correctos (§2).

---

## 1. Resumen ejecutivo y recomendación

VERI\*FACTU **no es opcional** para la práctica totalidad de comercios españoles que use un
TPV: es el régimen anti-fraude de los Sistemas Informáticos de Facturación (SIF) del
**Real Decreto 1007/2023**. simpleTPV es un **SIF** y, como tal, su fabricante (nosotros)
tiene obligaciones propias (declaración responsable, requisitos técnicos), y cada comercio
cliente es un **obligado tributario distinto** que debe remitir/conservar sus registros.

**Decisiones recomendadas** (justificadas en §2 y §4):

1. **Operar en modalidad «VERI\*FACTU»** (remisión continua a la AEAT), **no** en «NO
   VERI\*FACTU». Es la vía más barata y simple: la AEAT exime de **firma electrónica
   XAdES** de cada registro y del **registro de 9 eventos** del SIF; basta huella encadenada
   (ya la tenemos) + envío. Evitamos el binding C `xmlsec` por completo.
2. **El servicio web de la AEAT es gratuito.** El único coste obligatorio es el
   **certificado digital** (FNMT representante de persona jurídica: **14 €/2 años**; persona
   física: gratis).
3. **Modelo de envío en 2 fases** para abaratar al usuario y reducir nuestro riesgo:
   - **MVP (corto plazo):** modo «**asistido**» — generamos ticket conforme (QR + leyenda +
     huella encadenada) y el comercio registra con la **aplicación gratuita VERI\*FACTU de
     la AEAT** (0 €, sin certificado, sin integración). Cumple desde el día 1 con coste 0.
   - **Producto (medio plazo):** **integración directa SOAP** con la AEAT actuando como
     **Colaborador Social (acuerdo tipo 017)** con **un solo certificado nuestro**, enviando
     en nombre de todos los comercios sin apoderamiento notarial individual. Escalable y
     barato para el usuario (no necesita certificado propio).
4. **No dependemos de un SaaS de pago** (Verifacti, B2Brouter, Quaderno) salvo como salida
   de emergencia/comparativa; integrar directo es gratis y ya tenemos el 70 % hecho.

**Plazos** (verificados, §2): obligatorio **1-ene-2027** (Impuesto sobre Sociedades) y
**1-jul-2027** (resto). Hasta entonces hay **período de pruebas**. Margen real, pero el
trabajo de transporte (§5, Fase 4) es el grueso y conviene tenerlo en preproducción en 2026.

---

## 2. Marco legal y plazos (verificado contra BOE)

### 2.1 Normativa vigente (junio 2026)

| Norma | BOE | Qué hace |
|---|---|---|
| **RD 1007/2023**, de 5-dic | [BOE-A-2023-24840](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840) (pub. 6-dic-2023) | Reglamento de requisitos de los SIF (integridad, conservación, trazabilidad, inalterabilidad) y estandarización de registros. |
| **Orden HAC/1177/2024**, de 17-oct | [BOE-A-2024-22138](https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138) (pub. 28-oct-2024) | Especificaciones técnicas, funcionales y de contenido (huella, QR, registros, servicios web). En vigor 29-oct-2024. |
| Corrección de errores Orden | [BOE-A-2024-23180](https://www.boe.es/buscar/doc.php?id=BOE-A-2024-23180) (pub. **8-nov-2024**) | Correcciones técnicas de la Orden. |
| **RD 254/2025**, de 1-abr | [BOE-A-2025-6600](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600) | 1er aplazamiento: IS→1-ene-2026, resto→1-jul-2026. *(superado)* |
| **RD-ley 15/2025**, de 2-dic | [BOE-A-2025-24446](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446) (pub. 3-dic-2025) | **2º aplazamiento — VIGENTE:** IS→**1-ene-2027**, resto→**1-jul-2027**. |
| RD-ley 16/2025, de 23-dic | derogado [BOE-A-2026-2024](https://www.boe.es/buscar/doc.php?id=BOE-A-2026-2024) (27-ene-2026) | **Sin efecto** (no convalidado por el Congreso). No tocaba VERI\*FACTU. |

### 2.2 Hitos con fecha

| Fecha | Hito | A quién aplica |
|---|---|---|
| 28-oct-2024 | Orden técnica publicada; arranca plazo de **9 meses** para fabricantes de software | Fabricantes/comercializadores de SIF (**nosotros**) |
| **28-jul-2025** | Vencido el plazo de fabricantes: el software debe ofrecerse **adaptado** (no prorrogado por RD 254/2025 ni RD-ley 15/2025) | Fabricantes de SIF (**nosotros — ya en mora si comercializamos sin adaptar**) |
| 23-abr-2025 | Servicios web AEAT (remisión voluntaria + consulta) **en producción** | Integradores |
| **31-dic-2026** | Fin del período de pruebas para IS | Comercios sujetos a IS |
| **1-ene-2027** | **Obligatorio** VERI\*FACTU | Comercios sujetos a **Impuesto sobre Sociedades** (art. 3.1.a) |
| **30-jun-2027** | Fin del período de pruebas para el resto | Autónomos/IRPF, etc. |
| **1-jul-2027** | **Obligatorio** VERI\*FACTU | Resto de obligados (IRPF, IRNR con EP, atribución de rentas) |

> **Matiz clave verificado:** el plazo de **fabricantes (28-jul-2025) NO se aplazó**; solo se
> aplazaron los plazos de los **obligados tributarios** (usuarios) a 2027. Es decir: el
> producto debería estar técnicamente adaptado **ya**, aunque los comercios no estén
> obligados a usarlo hasta 2027. Esto refuerza priorizar el cierre técnico + la
> **declaración responsable** (§5, Fase 7) cuanto antes.

### 2.3 Ámbito y exenciones

- **Obligados** (art. 3.1 RD 1007/2023): contribuyentes de IS; de IRPF con actividad
  económica; de IRNR con establecimiento permanente; entidades en atribución de rentas.
- **Exentos / fuera de ámbito:** quienes ya usan **SII** (Suministro Inmediato de
  Información); quienes facturan **exclusivamente a mano** (sin SIF); **País Vasco y Navarra**
  (régimen foral, con normativa TicketBAI/propia); entidades exentas de IS (art. 9 Ley
  27/2014). → simpleTPV debe permitir **marcar un comercio como exento** y no exigirle
  remisión (§5, Fase 6).
- **Multi-tenant (art. 7):** «un mismo sistema informático puede ser utilizado por diversos
  obligados tributarios siempre que los registros de facturación de cada obligado estén
  **diferenciados**». Ya cumplimos: la cadena de huellas y los registros están aislados por
  `organizationId` (RLS). Cada comercio = NIF = su propia cadena.

---

## 3. Estado actual en el código (qué está hecho)

**Resumen:** Fases 1–3 de la spec previa **+ F1 + RegistroAnulacion** ya implementados y
verificados (incluido contra **vectores oficiales** de la AEAT). Falta esencialmente **el
transporte real a la AEAT** y la **capa de cumplimiento/operación** alrededor.

### 3.1 Hecho y verificado ✅

| Área | Dónde | Estado |
|---|---|---|
| **Huella oficial SHA-256** (alta y anulación) | `crates/domain/src/verifactu/hash.rs` | ✅ Verificada contra **vectores oficiales** del PDF huella v0.1.2 (`F7B9…2B97`, `1775…0C68`). Hex mayúsculas, UTF-8, encadenado, campo vacío→`nombre=`. |
| **Cadena de huellas por tenant** | `record.rs::lock_chain_and_previous_hash` | ✅ Serializada con `pg_advisory_xact_lock` + `previousHash`; alta y anulación comparten cadena. |
| **Registro de factura** F2 (ticket) y **F1** (con Destinatario NIF+razón social) | `record.rs::record_invoice` + `sales/service.rs` | ✅ Atómico dentro de la tx de venta (SEC-02). |
| **Rectificativa R5** (devolución/abono, importes negativos) | `record.rs::record_rectification` + `returns/service.rs` | ✅ |
| **RegistroAnulacion** de ventas anuladas (VOIDED) | `record.rs::record_anulacion` + `sales/service.rs:925` | ✅ Referencia exacta a la factura anulada. |
| **Payload JSONB con desglose de IVA** (nombres XSD: `impuesto`, `tipoImpositivo`, `baseImponibleOimporteNoSujeto`, `cuotaRepercutida`) | `record.rs` | ✅ Listo para construir el XML y re-verificar huella. |
| **Datos QR oficiales** (nif, numserie, fecha, importe; URL-encoded; base configurable `AEAT_COTEJO_URL`) | `hash.rs::build_qr_data` | ✅ |
| **Cola de envío** con reintentos, `FOR UPDATE SKIP LOCKED`, `MAX_ATTEMPTS=5`→FAILED | `verifactu/queue.rs` | ✅ Estructura lista; falta el proveedor real. |
| **Abstracción de proveedor** (`trait VerifactuProvider`) + `SandboxProvider` | `queue.rs` | ✅ Punto de inyección del cliente AEAT real. |
| **Worker de fondo** (gated tras `VERIFACTU_SANDBOX_SEND`, **OFF por defecto** en prod → no marca SENT en falso) | `crates/app/src/main.rs` | ✅ Diseño correcto (fail-safe legal). |
| **API gestión** `GET /verifactu/records`, `POST /verifactu/records/:id/retry` (ADMIN/MANAGER, RLS) | `crates/http/src/verifactu.rs` | ✅ |
| **BD**: tabla `VerifactuRecord` (+RLS), enums, `Sale.customerTaxId/customerName`, `Organization.nif` | `crates/app/migrations/2026052…`, `…anulacion`, `…sale_customer_fiscal` | ✅ |
| **Panel backoffice** (KPIs de cola: enviados hoy/en cola/fallidos/último envío) | `apps/backoffice/src/VerifactuPage.tsx`, `lib/verifactu.ts` | ✅ |
| **Captura F1 en el TPV** (NIF + razón social, juntos o ninguno) | `apps/tpv/src/PaymentModal.tsx`, `CartPanel.tsx`, `sales/input.rs::fiscal_recipient` | ✅ |
| **Enlace de cotejo en el recibo** | `crates/domain/src/receipt.rs` | ⚠️ Sólo **enlace de texto** + «VeriFactu · cotejo AEAT». **No** hay QR escaneable ni la leyenda oficial exacta. |

### 3.2 Dependencias ya disponibles

`sha2` ✓, `reqwest 0.12` (rustls-tls, json, stream) ✓, `sqlx` (tls-rustls) ✓.
**Faltan:** crate de **QR** (`qrcode`), **XML** (`quick-xml`/`yaserde`/`instant-xml`),
**identidad cliente mTLS** (feature de `reqwest` para PKCS#12 / certificado de cliente).

---

## 4. Decisión de arquitectura: ¿cómo enviamos a la AEAT?

Cada comercio es un obligado distinto (§2.3). Hay que decidir **quién** se autentica ante la
AEAT y **cómo**. Cuatro vías, de menor a mayor integración:

| Vía | Coste para el comercio | Coste/works para nosotros | Cumple | Recomendación |
|---|---|---|---|---|
| **A. App gratuita AEAT (modo asistido)** | 0 € (registra a mano con la app web de la AEAT) | Bajo: solo generar ticket conforme (QR+leyenda+huella) que ya casi tenemos | ✅ Sí | **MVP / día 1.** Cobertura legal inmediata sin certificados. |
| **B. Integración directa, certificado por comercio** | 14 €/2a (FNMT RPJ) o cert. propio | Medio: cliente SOAP+mTLS + UI de subida de certificado por tenant | ✅ Sí | Para comercios que quieran automatización total y aporten su certificado. |
| **C. Colaborador Social (acuerdo tipo 017)** | **0 €** (no necesita certificado) | Medio-alto: 1 certificado nuestro + alta como colaborador social + envío en nombre de terceros | ✅ Sí | **Producto recomendado.** Lo más barato y cómodo para el usuario; escalable. |
| **D. SaaS homologado de terceros** | 2,9 €/NIF/mes (Verifacti) … 110 €/año (B2Brouter) … 8–60 €/mes (Quaderno) | Bajo (su API) pero recurrente y dependencia externa | ✅ Sí | Solo como **fallback** / comparación. Encarece al usuario sin necesidad. |

**Estrategia adoptada:** **A → C**.
- **A** nos da cumplimiento inmediato con coste 0 mientras desarrollamos.
- **C** (Colaborador Social) es el objetivo: el comercio no paga ni gestiona certificados;
  nosotros enviamos por todos con **un** certificado de representante de persona jurídica
  (14 €/2 años, coste nuestro, amortizado entre todos los tenants). **Sustituye** al
  apoderamiento notarial individual (60–120 €/comercio), que sería inviable a escala.
- **B** se ofrece como opción avanzada (el `trait VerifactuProvider` permite ambas impls
  conviviendo: por tenant se elige `colaborador_social` vs `certificado_propio`).

> **A verificar antes de C (tarea legal, no de código):** formalizar el **acuerdo de
> colaboración social** (modelo/condiciones tipo 017) y confirmar su alcance exacto para
> remisión VERI\*FACTU en nombre de terceros. Es un trámite administrativo ante la AEAT.
> Mientras no esté firmado, operamos en modo **A** (asistido) o **B** (cert. del comercio).

---

## 5. Plan de implementación (lo que falta), por fases

Numeración continúa la spec previa (Fases 1–3 ✅). **Fase 4** es el grueso.

### Fase 4 — Transporte real a la AEAT (SOAP + mTLS) — *el núcleo pendiente*

**Objetivo:** sustituir `SandboxProvider` por un `AeatVerifactuProvider` que construye el XML
`RegFactuSistemaFacturacion`, lo envía por SOAP 1.1 sobre mTLS y procesa la respuesta.

Nuevo módulo `crates/domain/src/verifactu/aeat/` (o crate `crates/verifactu-aeat`):

4.1 **Construcción del XML** (`xml.rs`)
- Mensaje raíz `RegFactuSistemaFacturacion` con:
  - **`Cabecera`** → `ObligadoEmision` (NombreRazon + NIF del comercio).
  - **`RegistroFactura[]`** (1..1000) → cada uno `RegistroAlta` o `RegistroAnulacion`.
- **`RegistroAlta`** (desde el `payload` JSONB que ya guardamos): `IDVersion`,
  `IDFactura` (IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura), `NombreRazonEmisor`,
  `TipoFactura` (F1/F2/R5), `DescripcionOperacion`, `Destinatarios` (solo F1),
  `Desglose` (líneas IVA), `CuotaTotal`, `ImporteTotal`,
  **`Encadenamiento`** (`PrimerRegistro` o `RegistroAnterior{IDEmisorFactura, NumSerieFactura,
  FechaExpedicionFactura, Huella}`), **`SistemaInformatico`** (datos del SIF — ver Fase 7),
  `FechaHoraHusoGenRegistro`, `TipoHuella`=`01` (SHA-256), `Huella`.
- **`RegistroAnulacion`**: `IDFactura` anulada + `Encadenamiento` + `SistemaInformatico` +
  fecha/huella. (El payload de anulación ya está en BD.)
- **Re-verificar la huella** justo antes de enviar: recomputar con `compute_alta_hash` /
  `compute_anulacion_hash` desde los campos del XML y comparar con la almacenada
  (defensa contra corrupción de la cadena).
- **Crates:** `quick-xml` (serialización con control fino del orden de elementos, que el XSD
  exige) o `yaserde`. **Decisión:** `quick-xml` con escritura manual del árbol → control
  total del orden y namespaces; evita sorpresas de derive.
- ⚠️ **El orden exacto de elementos, tipos (decimales, longitudes) y namespaces se toman del
  XSD vigente** del portal de desarrolladores (`SuministroLR.xsd` / `SuministroInformacion.xsd`,
  paquete `tikeV1.0`), **no de memoria**. Descargar el XSD y validar el XML generado contra
  él (test con `libxml2`/validador) antes del primer envío.

4.2 **Cliente SOAP + mTLS** (`client.rs`)
- SOAP 1.1 sobre HTTPS:443. Envelope SOAP con el body `RegFactuSistemaFacturacion`.
- **Endpoints** (configurables por env, default preproducción):
  - Producción: `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (y `www10`).
  - Pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (y `prewww10`).
- **mTLS:** `reqwest` con **identidad de cliente** (certificado del comercio en modo B, o el
  nuestro en modo C). Cargar PKCS#12 con `Identity::from_pkcs12_der(&p12, &password)`
  (requiere `reqwest` con `native-tls` para PKCS#12, **o** convertir a PEM y usar
  `rustls` con `from_pem`/cliente cert — mantener coherencia con el resto del stack rustls;
  **decisión:** PKCS#12→PEM en memoria + cliente rustls, para no añadir `native-tls`).
- **NO** firma XAdES (modalidad VERI\*FACTU exime — confirmado por FAQ AEAT). Esto elimina la
  necesidad del binding C `xmlsec` y simplifica radicalmente.

4.3 **Parseo de respuesta** (`response.rs`)
- `RespuestaRegFactuSistemaFacturacion`: `EstadoEnvio` ∈ {`Correcto`, `ParcialmenteCorrecto`/
  `AceptadoConErrores`, `Incorrecto`}, `CSV` (justificante), `TiempoEsperaEnvio` (segundos),
  y por línea `RespuestaLinea{ IDFactura, EstadoRegistro, CodigoErrorRegistro,
  DescripcionErrorRegistro }`.
- **Mapear a estado del registro:**
  - `Correcto` o `AceptadoConErrores` con la línea `Correcto`/`AceptadoConErrores` → **SENT**,
    guardar **CSV**.
  - Línea `Incorrecto` → leer código: si es **duplicado** (ya registrado) → tratar como
    **SENT** (idempotencia). Si es error de datos → **FAILED** con `lastError = código+desc`
    (no reintentar a ciegas: requiere subsanación, Fase 6).
- **Códigos de error**: tabla de mapeo desde el PDF «Validaciones y errores» del portal
  (extraer al implementar; distinguir *reintentable* vs *requiere subsanación*).

4.4 **Control de flujo y batching** (en `queue.rs`)
- La AEAT impone un **tiempo de espera entre envíos** (`TiempoEsperaEnvio`, inicial **60 s**,
  ajustable por la respuesta). El worker debe **respetarlo**: tras cada envío, esperar el `t`
  devuelto antes del siguiente.
- **Agrupar hasta 1000 registros por envío** por tenant (hoy se envía 1 a 1). Cambiar
  `process_pending_batch` para: agrupar PENDING **por `organizationId`** (cada NIF su envío,
  con su certificado/identidad) y mandar lotes ≤1000.
- **Reintentos:** al menos cada hora para pendientes (cumple el mínimo legal). Backoff
  exponencial dentro de ese marco. Persistir `nextAttemptAt` (nueva columna).
- **Persistir `tiempoEsperaEnvio`** y respetarlo a nivel de tenant.

4.5 **Inyección del proveedor real** (`crates/app/src/main.rs`)
- Sustituir el gating `VERIFACTU_SANDBOX_SEND` por selección de proveedor:
  `VERIFACTU_PROVIDER ∈ {off, sandbox, aeat_preprod, aeat_prod}`. En `aeat_*`, construir
  `AeatVerifactuProvider` con endpoints + estrategia de identidad (B/C).

**Entregables Fase 4:** `aeat/{xml,client,response,errors}.rs`, tests de serialización contra
XSD, tests de parseo de respuestas de ejemplo, worker con control de flujo + batching.

### Fase 5 — QR físico y leyenda oficial en el ticket

Hoy el recibo (`receipt.rs`) solo pinta un **enlace**. La norma exige **código QR
escaneable** + **leyenda**.

5.1 **Generar el QR** (ISO/IEC 18004, **nivel de corrección M**, 30–40 mm, zona de silencio
≥2 mm) a partir de `build_qr_data(...)`:
- **Server-side (recomendado):** crate `qrcode` → **SVG** embebido en el HTML del recibo
  (escala bien a impresoras térmicas y a PDF; sin dependencia de red).
- Para **ESC/POS** (impresoras térmicas): usar el comando nativo de QR de la impresora
  (`GS ( k`) cuando exista, o imprimir el SVG/bitmap como imagen. Revisar el flujo de
  impresión del TPV (`apps/tpv` usa impresión del HTML del servidor vía iframe —
  `lib/receipt.ts`; el QR va dentro de ese HTML, así que con el SVG en `receipt.rs` basta
  para el caso navegador/PDF; el ESC/POS directo es una mejora posterior).

5.2 **Leyenda oficial** en el recibo, según modalidad:
- En modo VERI\*FACTU: **«VERI\*FACTU»** + **«Factura verificable en la sede electrónica de
  la AEAT»** junto al QR.
- (Si algún comercio operara en NO VERI\*FACTU, la leyenda cambia — no es nuestro caso por
  defecto.)
- Mostrar la leyenda/QR **solo** cuando el comercio esté en modo verifactu activo (Fase 6).

5.3 Actualizar tests de `receipt.rs` (`render_enlace_cotejo_verifactu`) para exigir el
elemento QR (`data-testid="receipt-qr"`) y el texto de leyenda exacto.

### Fase 6 — Configuración multi-tenant, modo y subsanación

6.1 **Config por comercio** (nueva tabla `VerifactuConfig` o columnas en `Organization`):
- `mode ∈ {DISABLED, ASSISTED, DIRECT_OWN_CERT, COLLAB_SOCIAL}` (mapea a §4 A/B/C).
- `obligadoTipo` (IS / otros) → para mensajes de plazo (2027) y exenciones.
- `exento` (bool) + motivo (SII / foral / manual) → no se exige remisión.
- `razonSocial` del obligado (la `Cabecera` necesita NombreRazon; hoy solo hay `name`+`nif`).
- En modo B: referencia al **certificado** (Fase 8) y su caducidad.

6.2 **Onboarding en backoffice** (ampliar `VerifactuPage.tsx`):
- Selector de modalidad, alta de razón social/NIF, subida de certificado (modo B),
  estado del acuerdo de colaboración social (modo C), aviso de plazos (countdown a 2027),
  y **descarga/visualización de la declaración responsable** (Fase 7).

6.3 **Registros de subsanación** (obligación legal cuando la AEAT rechaza o hay error):
- Hoy `retry` solo reenvía igual. Añadir **`RegistroAlta` de subsanación** con marca
  `Subsanacion="S"` (y `RechazoPrevio` cuando aplique) para corregir un registro rechazado,
  **manteniendo el encadenamiento**. Nuevo endpoint/acción y tipo de registro.
- Distinguir en UI: *reintentable* (problema de transporte) vs *requiere subsanación*
  (datos), según el código de error de la Fase 4.3.

### Fase 7 — Declaración responsable del software (obligación del fabricante)

Obligación **nuestra** (no del comercio). Verificado: la emite el **productor del SIF**,
debe constar por escrito, visible **dentro** del software (p. ej. menú Ayuda/Acerca de) y
**fuera** (PDF), antes de comercializar.

7.1 Redactar la **declaración responsable** con: datos del sistema (nombre `simpleTPV`,
código identificador, **versión**, características/funcionalidades), datos del productor
(identificación y domicilio), lugar/fecha, y la **afirmación de cumplimiento** del RD
1007/2023 y la Orden HAC/1177/2024.
7.2 Definir el bloque **`SistemaInformatico`** que va en **cada** registro (NIF del productor,
nombre, `IdSistemaInformatico`, `Version`, `NumeroInstalacion`, indicadores
`TipoUsoPosibleSoloVerifactu` / `IndicadorMultiplesOT`). Constantes en config; alimentan la
Fase 4.1.
7.3 Publicar el PDF + pantalla «Acerca de / Cumplimiento» en backoffice que lo muestre.

### Fase 8 — Almacenamiento seguro de certificados (solo modo B)

Solo aplica si se permite que comercios suban su certificado. (Modo C usa **un** certificado
nuestro, fuera de BD, en secreto del despliegue.)
- **No** guardar PKCS#12 en claro. Cifrado en reposo: clave del entorno (KMS/secret manager)
  o `age`/AES-GCM con clave fuera de BD. Tabla `VerifactuCertificate` (org, blob cifrado,
  huella, `validFrom/validTo`, `subject`).
- **Monitor de caducidad:** alertar N días antes (la caducidad del certificado **rompe** la
  remisión, no la cadena de huellas, que es independiente).
- Acceso solo desde el worker (BYPASSRLS) y la UI de alta (ADMIN), nunca expuesto por API.

### Fase 9 — Verificación de integridad y herramientas de operación

- **Comando/endpoint de re-verificación de cadena**: recorrer `VerifactuRecord` por tenant en
  orden, recomputar huellas y validar el encadenamiento (`previousHash` == huella del
  anterior). Detecta manipulaciones/corrupción. Reutiliza `compute_*_hash`.
- **Consulta a la AEAT** (`ConsultaFactuSistemaFacturacion`) para conciliar lo remitido vs lo
  que la AEAT tiene (reconciliación periódica). Opcional pero recomendable.
- Métricas (Prometheus): tasa de rechazo, latencia de remisión, antigüedad del PENDING más
  viejo, disponibilidad AEAT. Alarma «PENDING > 1 h».

### Fase 10 — Pruebas en preproducción AEAT

- Dar de alta el **entorno de pruebas** (`prewww1/prewww10.aeat.es`), con certificado de
  pruebas (cualificado estándar; confirmar si la AEAT exige uno específico de preproducción).
- Validar XML contra XSD; enviar casos: alta F2, alta F1, rectificativa R5, anulación,
  subsanación, lote de 1000, control de flujo (respetar `t`), duplicado, error de datos.
- Las facturas de pruebas **no tienen valor fiscal**. Documentar resultados.

---

## 6. Modelo de datos — migraciones nuevas

```sql
-- Estado de envío AEAT en el registro
ALTER TABLE "VerifactuRecord"
  ADD COLUMN "csv"            TEXT,           -- justificante AEAT
  ADD COLUMN "aeatState"      TEXT,           -- Correcto/AceptadoConErrores/Incorrecto
  ADD COLUMN "errorCode"      TEXT,           -- código de error de línea
  ADD COLUMN "nextAttemptAt"  TIMESTAMP(3),   -- backoff/control de flujo
  ADD COLUMN "subsanacion"    BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "VerifactuType" ADD VALUE IF NOT EXISTS 'SUBSANACION';  -- si se modela como tipo

-- Configuración VERI*FACTU por comercio
CREATE TABLE "VerifactuConfig" (
  "organizationId" UUID PRIMARY KEY REFERENCES "Organization"(id),
  "mode"        TEXT NOT NULL DEFAULT 'DISABLED', -- DISABLED|ASSISTED|DIRECT_OWN_CERT|COLLAB_SOCIAL
  "razonSocial" TEXT,
  "obligadoTipo" TEXT,                            -- IS|OTHERS
  "exento"      BOOLEAN NOT NULL DEFAULT false,
  "exentoMotivo" TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT now()
);  -- + RLS tenant_isolation (patrón NULLIF), GRANT app/app_admin

-- Certificados (solo modo DIRECT_OWN_CERT)
CREATE TABLE "VerifactuCertificate" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"(id),
  "encBlob"   BYTEA NOT NULL,    -- PKCS#12 cifrado (AES-GCM/age), NUNCA en claro
  "subject"   TEXT,
  "validFrom" TIMESTAMP(3),
  "validTo"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);  -- + RLS, índice por (organizationId, validTo)
```

(Recordar el flujo del repo: el SQL fuente vive en `crates/app/migrations/` y se aplica al
arrancar; `packages/db/prisma/schema.prisma` se mantiene en paralelo como fuente del schema.)

---

## 7. Crates y decisiones técnicas

| Necesidad | Crate | Notas |
|---|---|---|
| SHA-256 | `sha2` 0.10 | Ya en uso. |
| QR | `qrcode` 0.14 | Salida **SVG** para el HTML del recibo; nivel M. |
| XML | `quick-xml` 0.36+ | Escritura manual del árbol → control de orden/namespaces que exige el XSD. |
| HTTP/SOAP + mTLS | `reqwest` 0.12 | Ya en uso (rustls-tls). Cliente cert: convertir PKCS#12→PEM y cargar identidad rustls (evita añadir `native-tls`). |
| Validación XSD (test/dev) | `libxml`/binario `xmllint` | Validar el XML contra el XSD oficial en CI antes de enviar. |
| Cifrado certificados | `aes-gcm` + clave de entorno, o `age` | Modo B. |

**Sin XAdES / sin `xmlsec`:** confirmado que VERI\*FACTU **no** exige firma electrónica de
registros (se sustituye por huella + remisión). Es la mayor simplificación del proyecto.

---

## 8. Seguridad

- Certificados (modo B): cifrado en reposo, fuera de la API, acceso solo worker/alta ADMIN.
- Modo C: el certificado del fabricante vive en **secreto del despliegue** (no en BD), nunca
  en el repo ni en logs.
- mTLS verifica la cadena de la AEAT; fijar las CA esperadas.
- No registrar payloads completos ni el CSV en logs de nivel info (datos fiscales).
- Mantener RLS en todas las tablas nuevas (patrón NULLIF, fail-safe).

## 9. Testing y verificación

- **Unit** (dominio): XML↔XSD, mapeo de respuestas/errores, control de flujo, subsanación,
  re-verificación de cadena. Mantener los **vectores oficiales** de huella.
- **Integración** (Postgres efímero, sin mocks de BD): batching por tenant, transiciones de
  estado, idempotencia de duplicados.
- **Preproducción AEAT** (Fase 10): casos reales contra `prewww*`.
- **E2E** (Playwright): ticket con QR+leyenda; panel de cumplimiento; onboarding.
- Objetivo de cobertura del proyecto (≥80 %).

## 10. Riesgos y decisiones abiertas

- **Formalización del acuerdo de colaboración social (tipo 017)** — trámite legal previo al
  modo C. Hasta entonces, modos A/B. *(Confianza alta en que existe; confirmar alcance exacto
  para VERI\*FACTU en el trámite.)*
- **XSD exacto y códigos de error**: tomar del portal de desarrolladores al implementar
  (versionado `tikeV1.0`); validar contra el validador oficial. No codificar de memoria.
- **Renovación de certificados** sin interrupción (modo B) y ventana de caducidad.
- **Sanciones**: el incumplimiento del fabricante (software no adaptado) y del usuario tiene
  régimen sancionador propio (LGT/RD 1007/2023). Refuerza priorizar la **declaración
  responsable** y el cierre técnico.
- **GDPR**: NIF/razón social del cliente en F1 → base legal (obligación fiscal) y retención
  alineada con la conservación tributaria.
- **Frontera fiscal (medianoche)**: ya resuelta anclando fechas a `Europe/Madrid` con DST.

---

## 11. Coste total estimado

| Concepto | Coste |
|---|---|
| Servicio web AEAT (remisión + consulta) | **0 €** |
| Aplicación gratuita VERI\*FACTU AEAT (modo A) | **0 €** |
| Certificado FNMT representante persona jurídica (modo B por comercio o **uno** nuestro en modo C) | **14 € / 2 años** |
| Apoderamiento notarial (evitado al usar colaborador social) | ~60–120 € *(no incurrido)* |
| SaaS de terceros (evitado) | 2,9 €/NIF/mes … 110 €/año *(no incurrido)* |
| **Coste para el comercio en modo C** | **0 €** |
| **Coste para nosotros (fabricante)** | **14 €/2a** (certificado) + desarrollo |

→ La vía elegida (**A→C**) deja el coste del usuario en **0 €** y el nuestro en **14 €/2
años** + el desarrollo de las Fases 4–10.

## 12. Cronograma sugerido (alineado a plazos)

1. **Inmediato:** Fase 5 (QR+leyenda) + Fase 7 (declaración responsable) + modo A (asistido)
   → producto **conforme** con coste 0 y obligación de fabricante cubierta.
2. **2026 (recomendado en preproducción):** Fase 4 (transporte) + Fase 6 (config/subsanación)
   + Fase 10 (pruebas AEAT) en modo B, y tramitar colaboración social (modo C).
3. **Antes de 1-ene-2027:** modo C en producción para comercios sujetos a IS.
4. **Antes de 1-jul-2027:** resto de comercios.

## 13. Fuentes oficiales (verificadas)

- RD 1007/2023 — https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840
- Orden HAC/1177/2024 — https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138
- Corrección de errores — https://www.boe.es/buscar/doc.php?id=BOE-A-2024-23180
- RD 254/2025 — https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600
- RD-ley 15/2025 (plazos vigentes) — https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446
- Derogación RD-ley 16/2025 — https://www.boe.es/buscar/doc.php?id=BOE-A-2026-2024
- Portal desarrolladores AEAT (WSDL/XSD/huella/QR/firma/validaciones) —
  https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html
- Sede VERI\*FACTU (general, FAQ, app gratuita, colaboración social) —
  https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html
- WSDL — https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl
- FNMT certificados (precios) — https://www.sede.fnmt.gob.es/certificados/certificado-de-representante

---

### Apéndice — Mapa de obligaciones → estado

| Requisito legal | Estado | Fase |
|---|---|---|
| Huella SHA-256 encadenada | ✅ | 1 |
| Integridad/inalterabilidad/trazabilidad | ✅ (cadena + RLS + tx atómica) | 1/3 |
| Registros alta / rectificativa / anulación | ✅ | 3 |
| QR escaneable (ISO 18004) en factura | ❌ | 5 |
| Leyenda «VERI\*FACTU / verificable en sede AEAT» | ❌ (solo enlace) | 5 |
| Remisión continua a la AEAT (≤1000/envío, control de flujo) | ❌ | 4 |
| Procesado de respuesta + CSV + subsanación | ❌ | 4/6 |
| Sin firma XAdES (modalidad VERI\*FACTU) | ✅ (no aplica) | — |
| Sin registro de eventos (modalidad VERI\*FACTU) | ✅ (no aplica) | — |
| Declaración responsable del fabricante | ❌ | 7 |
| Bloque `SistemaInformatico` en registros | ❌ | 4/7 |
| Config modo/exención por comercio | ❌ | 6 |
| Gestión de certificados (modo B) | ❌ | 8 |
| Pruebas en preproducción | ❌ | 10 |
