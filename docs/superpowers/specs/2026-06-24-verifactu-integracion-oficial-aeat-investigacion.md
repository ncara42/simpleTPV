# Integración oficial software ↔ AEAT bajo VeriFactu — Informe técnico-legal y análisis de brechas del repo

- **Fecha:** 2026-06-24
- **Método:** investigación multi-agente (6 facetas en paralelo sobre fuentes oficiales AEAT + BOE; verificación adversarial de 14 afirmaciones críticas con 3 lentes cada una — texto legal BOE / docs técnicas / portal AEAT; síntesis). PDFs huella v0.1.2, QR v0.5.0 y Descripción SWeb v1.0.3, WSDL y XSD `tikeV1.0` parseados verbatim.
- **Ámbito:** qué exige la integración oficial y qué falta en `crates/domain/src/verifactu/`.

## 1. Resumen ejecutivo

La **integración oficial** de un Sistema Informático de Facturación (SIF) con la AEAT bajo el régimen VeriFactu consiste en: (a) cumplir el Reglamento RD 1007/2023 y la Orden HAC/1177/2024 (huella SHA‑256 encadenada, QR tributario, bloque `SistemaInformatico`, registro de eventos), (b) **autocertificar** la conformidad mediante una _declaración responsable_ del productor —**no hay homologación previa de la AEAT**— y, si se elige la modalidad VERI\*FACTU, (c) **remitir cada registro de facturación en tiempo real** a la AEAT por un servicio web **SOAP 1.1 document/literal sobre HTTPS con certificado electrónico cualificado** (mTLS de transporte). No existe ningún "alta" ni registro del software ante la AEAT antes de comercializar.

En este repo (`crates/domain/src/verifactu/`) **lo difícil ya está hecho y verificado contra los vectores oficiales**: huella encadenada (`hash.rs`, vectores Alta caso 2 `F7B94CFD…` y Anulación caso 3 `177547C0…`), QR de cotejo, tipos F1/F2/R5/ANULACION, desglose de IVA, modelo `VerifactuRecord` con RLS y cola con reintentos. **Falta toda la capa de transporte real**: construcción del XML conforme al XSD, cliente SOAP, mTLS con certificado cualificado, envío a la AEAT, manejo de respuesta/CSV/errores, registro de eventos, y la propia declaración responsable. El único `VerifactuProvider` es un `SandboxProvider` que simula OK sin llamar a la AEAT.

## 2. Marco legal y plazos vigentes

Cuatro instrumentos:

1. **Ley 11/2021 antifraude** — introduce en la LGT (Ley 58/2003) el art. **29.2.j)** (integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de los registros) y el art. **201 bis** (régimen sancionador). [BOE-A-2003-23186 consolidado](https://www.boe.es/buscar/pdf/2003/BOE-A-2003-23186-consolidado.pdf).
2. **RD 1007/2023** (Reglamento de requisitos de los SIF, RRSIF). [BOE-A-2023-24840](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840).
3. **Orden HAC/1177/2024**, de 17‑10‑2024 (especificaciones técnicas). [BOE-A-2024-22138](https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138), corrección de errores [BOE-A-2024-23180](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-23180).
4. **Modificaciones de plazos**: RD 254/2025 ([BOE-A-2025-6600](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600)) y, sobre todo, el **Real Decreto‑ley 15/2025, de 2 de diciembre** ([BOE-A-2025-24446](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-24446)), que fija los plazos **vigentes**.

### Plazos vigentes (consenso _confirmed_, 3/0/0)

El RD‑ley 15/2025 da nueva redacción a la **disposición final cuarta del RD 1007/2023**:

| Colectivo                                                                                  | Fecha límite vigente                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------- |
| Obligados art. 3.1.a) — **contribuyentes del Impuesto sobre Sociedades**                   | **antes del 1 de enero de 2027**      |
| **Resto de obligados** del art. 3.1 (IRPF/autónomos, IRNR con EP, entidades en atribución) | **antes del 1 de julio de 2027**      |
| **Productores/comercializadores de SIF** (art. 3.2) — ofrecer solo productos adaptados     | **29 de julio de 2025** (no aplazado) |
| Servicios VeriFactu de la AEAT en producción                                               | desde **23 de abril de 2025**         |

**Matiz:** el RD‑ley 15/2025 no modifica formalmente el RD 254/2025; ambos reescriben sucesivamente la **misma disposición final cuarta del RD 1007/2023** (254/2025 la fijó en 2026; 15/2025 la lleva a 2027 → sustitución material). Convalidado por el Congreso (BOE-A-2025-25695, 16‑12‑2025). [Nota informativa sede AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html).

### Régimen sancionador (art. 201 bis LGT — _confirmed_, 3/0/0)

| Conducta                                                          | Sujeto                        | Multa                                             |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| Fabricar/producir/comercializar SIF no conforme [201 bis.1.a)–e)] | Productor/comercializador     | **150.000 €** por ejercicio y por tipo de sistema |
| Tenencia de SIF no certificado (debiendo) o alterado [201 bis.2]  | Obligado tributario (usuario) | **50.000 €** por ejercicio                        |
| No certificar estando obligado [201 bis.1.f)]                     | Productor/comercializador     | **1.000 €** por sistema                           |

### Exenciones

No aplicación por resolución del Departamento de Inspección (art. 5 RD 1007/2023); fuera quienes llevan libros vía **SII** (art. 3.3 → art. 62.6 RIVA).

## 3. Las dos modalidades

Art. 7 RD 1007/2023: el obligado elige SIF propio conforme o la app de la AEAT. **La condición VERI\*FACTU se adquiere al remitir efectiva y sistemáticamente los registros a la AEAT.**

| Obligación técnica                               | **VERI\*FACTU** (remisión continua) | **NO VERI\*FACTU** (conservación local)                                   |
| ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| Huella/hash SHA‑256 encadenada                   | **Sí** (todos)                      | **Sí** (todos)                                                            |
| **Firma electrónica XAdES por registro**         | **NO** — exenta (art. 16.3)         | **SÍ obligatoria** — XAdES Enveloped (ETSI EN 319 132), cert. cualificado |
| Remisión a la AEAT                               | **Tiempo real**, automática, SOAP   | **Solo bajo requerimiento** (`RequerimientoSOAP`)                         |
| Registro de eventos del sistema                  | Reducido (exime arts. 8‑9 Orden)    | **Completo** (inicio/fin, anomalías, resumen cada 6 h)                    |
| Conservación local 4 años                        | No imprescindible (custodia AEAT)   | **Sí**                                                                    |
| QR tributario en factura                         | **Sí** + mención «VERI\*FACTU»      | **Sí** (QR), **sin** mención «factura verificable»                        |
| Presunción de cumplimiento «por diseño» (art. 8) | **Sí** (art. 16.2)                  | No                                                                        |
| Consulta de registros (`ConsultaFactu…`)         | **Sí**                              | **No**                                                                    |

### La firma XAdES (consenso _confirmed_, 6/0/0 en dos claims)

**En VERI\*FACTU NO se exige firma XAdES por registro.** La obligación general de firmar nace del **art. 12 RD 1007/2023**; el **art. 16.3** exime a los Sistemas verificables: _«…no tendrán la obligación de realizar la firma electrónica… siendo suficiente con que calculen la huella o «hash»»_. La AEAT lo motiva en que la remisión inmediata con certificado cualificado **equivale a una "firma básica"** ([FAQ Firma](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/firma.html)). En NO VERI\*FACTU la firma XAdES Enveloped es obligatoria para todos los registros (de facturación y de evento) con cert cualificado de la _EU/EEA Trusted List_ (art. 14 Orden). El `ds:Signature` del XSD es **opcional** (`minOccurs=0`).

## 4. Homologación vs. declaración responsable

**En España NO existe homologación, certificación previa ni registro del software por la AEAT, ni lista oficial de programas, ni tercero acreditado.** El mecanismo real es la **DECLARACIÓN RESPONSABLE** (autocertificación) del **productor** (art. 13 RD 1007/2023; art. 15 Orden). Consenso _confirmed_ (3/0/0 ×2). FAQ: _«Para certificar un producto no se requiere de procesos de certificación realizados por otras personas, entidades u organismos independientes»_ y _«no se prevé ningún registro previo del producto SIF»_ ([FAQ Declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html)).

Características (art. 13 RD + art. 15 Orden): por escrito y **visible dentro del propio sistema en cada versión** (+ copia independiente); la conservan fabricante y comercializador; cliente y AEAT solo la **solicitan** a posteriori. Contenido obligatorio (art. 15): denominación comercial, código identificador único, identificador de versión, componentes HW/SW, si funciona solo como VERI\*FACTU, si permite múltiples obligados, tipos de firma (solo NO VERI\*FACTU), razón social + NIF + dirección del productor, declaración de cumplimiento, fecha y lugar. Título: _«DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN»_.

**Matiz 201 bis:** la palabra «certificar» del 201 bis se refiere **a esta declaración responsable**, no a una de tercero. La obligación de "certificar" existe y se satisface por autocertificación; **no emitirla activa el tipo 201 bis.1.f)**.

## 5. Itinerario oficial de integración paso a paso

### (1) Fabricante / productor del SIF

1. Adaptar al RRSIF (seis garantías del art. 8.1).
2. Implementar **huella SHA‑256 encadenada** (huella v0.1.2), **QR tributario** (QR v0.5.0; arts. 20‑21 Orden) y, en VeriFactu, **remisión SOAP en tiempo real**.
3. Rellenar el bloque **`SistemaInformatico`**: NIF/IdOtro del fabricante, `NombreSistemaInformatico`, `IdSistemaInformatico` (2 pos.), `Version`, `NumeroInstalacion` (único e irrepetible), `TipoUsoPosibleSoloVerifactu`, `TipoUsoPosibleMultiOT`, `IndicadorMultiplesOT`.
4. Identificación universal del SIF = **Id.OEF (NIF del obligado) + Id.SIF (2 pos.) + NºInstalación** (nunca reutilizable). [FAQs‑Desarrolladores](https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf).
5. Emitir y conservar la **declaración responsable**, visible en cada versión.
6. **No hay registro/homologación ante la AEAT.**

### (2) Obligado tributario

1. **Certificado electrónico cualificado** (propio o de representante/sello), o **apoderar** a un tercero / **colaboración social** (Resolución 18‑12‑2024, [BOE-A-2024-27600](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27600)).
2. Sus NIF se validan contra la Base de Datos Centralizada de la AEAT (§4.1 doc SWeb).

### (3) Alta de factura (flujo VERI\*FACTU)

1. Genera `RegistroAlta`.
2. Calcula la **huella** encadenada con la del registro inmediatamente anterior (**orden cronológico de generación**, altas y anulaciones en una única cadena).
3. Genera el **QR** y emite la factura con QR (al principio).
4. **Remite inmediatamente** por SOAP 1.1 (`RegFactuSistemaFacturacion`), respetando el **control de flujo** (art. 16.2 Orden): envía cuando pasan `TiempoEsperaEnvio` segundos (inicial 60) **o** acumula 1.000 registros, lo que ocurra primero.

### (4) Respuesta

- **Síncrona.** `SoapFault` si falla la validación estructural (rechazo completo). Si la supera: **CSV** (16 alfanum. — **a almacenar, no recuperable**), `DatosPresentacion`, `EstadoEnvio` global y `RespuestaLinea` por registro.
- Huella que no coincide con el recálculo AEAT → **«Aceptado con errores»** (no rechaza).
- Errores no admisibles → `Incorrecto`: **subsanar y reenviar**.

### (5) Anulaciones / rectificativas / subsanaciones

- **Anulación**: `RegistroAnulacion` con misma clave (`IDFactura` campos `*Anulada`); `RechazoPrevio=S`, `SinRegistroPrevio=S`.
- **Subsanación**: nuevo `RegistroAlta` con `Subsanacion=S`, misma clave; el original queda inalterado.
- **Rectificativa**: R1‑R5 enlazada vía `FacturasRectificadas[]`, `TipoRectificativa` S (sustitutiva) / I (por diferencias).

### (6) NO VERI\*FACTU

No remite en tiempo real; conserva con **firma** (art. 12) + huella + **registro de eventos completo** (art. 8.3); remite **solo bajo requerimiento** (`RequerimientoSOAP`), sin subsanar.

### (7) Responsabilidades

Productor: declaración responsable + corrección técnica. Obligado: uso conforme (art. 6). **Delegar la remisión no exime al obligado.**

## 6. El servicio web

Fuente: **«Descripción del servicio web» v1.0.3 (28/07/2025)** + WSDL `SistemaFacturacion.wsdl` (`tikeV1.0`).

- **Protocolo**: SOAP **1.1**, **document/literal**, `soapAction` **vacío**, HTTPS, **UTF‑8**, respuesta **síncrona** (_confirmed_ 3/0/0). Binding `http://schemas.xmlsoap.org/wsdl/soap/`. [PDF v1.0.3](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf); [WSDL](https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl).
- **Dos servicios**: `sfVerifactu` (`RegFactuSistemaFacturacion` + `ConsultaFactuSistemaFacturacion`) y `sfRequerimiento` (solo `RegFactu…`). La **consulta solo existe en VERI\*FACTU** (_confirmed_ 3/0/0).
- **Endpoints** (alta y consulta comparten el port `VerifactuSOAP`; _confirmed_ 3/0/0):

| Entorno                      | Cert. estándar                                                                             | Cert. de sello                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Producción** VeriFactu     | `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` | `https://www10.agenciatributaria.gob.es/…/VerifactuSOAP` |
| **Pruebas** VeriFactu        | `https://prewww1.aeat.es/…/VerifactuSOAP`                                                  | `https://prewww10.aeat.es/…/VerifactuSOAP`               |
| Requerimiento (NO VeriFactu) | `…/SistemaFacturacion/RequerimientoSOAP` (mismos hosts)                                    |                                                          |

- **Lote máximo**: **1.000 registros por envío** (alta + anulación mezclados), **no 10.000** (los 10.000 = tope de la respuesta de la consulta, paginada). Art. 16.2 Orden + Anexo 2.2.
- **Cabecera**: `IDVersion` + `ObligadoEmision`{`NombreRazon`,`NIF`}; campo opcional **`<Representante>`** (colaboración social transitiva). `IDFactura` = `IDEmisorFactura` + `NumSerieFactura` + `FechaExpedicionFactura`.
- **Respuesta**: `CSV` (16, a almacenar), `DatosPresentacion`, `TiempoEsperaEnvio`, `EstadoEnvio` {Correcto/ParcialmenteCorrecto/Incorrecto}, `RespuestaLinea` {`EstadoRegistro`: Correcto/AceptadoConErrores/Incorrecto + `CodigoErrorRegistro` (5) + descripción}; duplicados con `IdPeticionRegistroDuplicado`.
- **Cadencia / control de flujo** (art. 16.2): `TiempoEsperaEnvio` **inicial 60 s, dinámico** (la AEAT devuelve un valor nuevo en cada respuesta que el SIF debe respetar).
- **Plazo máximo de remisión en horas**: el PDF SWeb no lo fija; vive en la Orden HAC/1177/2024 (ver §12).
- **Artefactos**: WSDL/XSD `tikeV1.0`; doc descriptivo v1.0.3. XSD: `SuministroInformacion.xsd`, `SuministroLR.xsd`, `ConsultaLR.xsd`, `RespuestaSuministro.xsd`, `RespuestaConsultaLR.xsd`.

## 7. Autenticación y certificado

- **Autenticación**: **certificado electrónico cualificado reconocido** a nivel de transporte (cliente X.509 eIDAS, UE 910/2014). **§4.3**: _«Las aplicaciones que envían información… deberán autenticarse con certificado electrónico cualificado reconocido»_. Sin usuario/contraseña, token ni API key. (Pendiente confirmar si además exige firma WS‑Security a nivel de mensaje — §12.)
- **El certificado NO tiene por qué ser del obligado tributario.** Puede ser de un **tercero** (representante/apoderado/colaborador social) con su propio cert ([FAQ Sistemas VERI\*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html)).
- **Un SaaS/proveedor PUEDE remitir por TODOS sus clientes con un único certificado propio**, vía **colaboración social** (arts. 79‑81 RD 1065/2007 + Orden HAC/1398/2003; **Convenio 17** de empresas de software) o **apoderamiento**. El campo opcional **`<Representante>`** de la cabecera soporta la **colaboración social transitiva** (obligado → asesor → plataforma cloud con su propio cert), añadido en v0.4.0 — **exactamente el modelo SaaS multi‑tenant de este repo**. Representación otorgable por medios electrónicos con constancia firmada. Solicitud: `comunicacion.sepri@correo.aeat.es`. [FAQs‑Desarrolladores](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf). **La delegación no exime al obligado.**
- **Coste certificados FNMT** ([precios](https://www.sede.fnmt.gob.es/certificados/certificado-de-representante/lista-de-precios-politica-de-devolucion)): representante de persona jurídica **14 €** sin IVA (16,94 € c/IVA); representante de entidad sin personalidad jurídica **0 €**; administrador único/solidario **24 €** sin IVA (29,04 € c/IVA).
- **Coste de la remisión**: **NO localizada cita literal oficial de gratuidad** → inferencia, no hecho citado (§10, §12).
- **App básica gratuita de la AEAT**: existe (Cl@ve/cert/DNIe; uno mismo o por tercero IZ862/IZ863), sin límite de facturas, pero **NO admite facturas simplificadas (tickets)**, ni claves 03/05/06/09, ni múltiples destinatarios, **ni exportación** → **no sirve para un TPV** ([app gratuita](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/aplicacion-gratuita-verifactu-aeat.html)).
- **Entorno de pruebas**: `preportal.aeat.es` / `prewww*.aeat.es`; facturas sin trascendencia tributaria; requiere cert cualificado válido (detalle operativo no 100 % explícito — §12).

## 8. Conformidad del registro (XSD)

[`SuministroInformacion.xsd`](https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroInformacion.xsd) (`tikeV1.0`) + PDFs huella v0.1.2 y QR v0.5.0.

### Bloque `SistemaInformatico` — OBLIGATORIO en CADA registro

| Campo                                                               | Restricción                  |
| ------------------------------------------------------------------- | ---------------------------- |
| `NombreRazon`                                                       | máx 120                      |
| `NIF` **XOR** `IDOtro`{`CodigoPais` + `IDType` 02‑07 + `ID` máx 20} | excluyente                   |
| `NombreSistemaInformatico`                                          | máx 30                       |
| `IdSistemaInformatico`                                              | máx 2                        |
| `Version`                                                           | máx 50                       |
| `NumeroInstalacion`                                                 | máx 100 (único, irrepetible) |
| `TipoUsoPosibleSoloVerifactu`                                       | S/N                          |
| `TipoUsoPosibleMultiOT`                                             | S/N                          |
| `IndicadorMultiplesOT`                                              | S/N                          |

### Otros obligatorios del `RegistroAlta`

`IDVersion` ("1.0"), `IDFactura`, `NombreRazonEmisor` (120), `TipoFactura`, `DescripcionOperacion` (500), `Desglose` (≤12 líneas), `CuotaTotal`, `ImporteTotal`, `Encadenamiento` (`PrimerRegistro="S"` XOR `RegistroAnterior`{IDEmisor+NumSerie+FechaExpedicion+Huella}), `SistemaInformatico`, `FechaHoraHusoGenRegistro` (ISO‑8601 con huso), `TipoHuella` ("01"=SHA‑256), `Huella` (≤64). `ds:Signature` **opcional**.

`TipoFactura`: **F1** (completa), **F2** (simplificada/ticket), **F3** (sustitución de simplificadas), **R1‑R4** (rectificativas art. 80 LIVA), **R5** (rectificativa de simplificada).

### Huella (huella v0.1.2)

- **SHA‑256** (`TipoHuella="01"`), UTF‑8, hex **MAYÚSCULAS 64**.
- **Alta (8 campos)**: `IDEmisorFactura&NumSerieFactura&FechaExpedicionFactura&TipoFactura&CuotaTotal&ImporteTotal&Huella(anterior)&FechaHoraHusoGenRegistro`.
- **Anulación (5 campos)**: `IDEmisorFacturaAnulada&NumSerieFacturaAnulada&FechaExpedicionFacturaAnulada&Huella(anterior)&FechaHoraHusoGenRegistro`.
- Campo vacío → `nombre=` sin valor. Decimales indistintos (123.1 == 123.10).
- Vectores: Alta caso 1 `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`; Alta caso 2 `F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97`; Anulación caso 3 `177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68`.

### Encadenamiento — CORRECCIÓN (consenso _refuted_, 0/3/0)

El encadenamiento incorpora la huella **COMPLETA** del registro anterior, **NO "los primeros 64 caracteres"**. La salida SHA‑256 (32 bytes) en hex **ya mide 64 caracteres**: no hay truncamiento. `Huella` es `TextMax64Type` (`maxLength=64`, un máximo, no un corte). [FAQ trazabilidad](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/caracteristicas-requisitos-sif-trazabilidad.html): _«…actualmente se trata de toda la huella»_. **El repo lo hace correctamente** (`hash.rs` inserta `previous_hash` íntegro).

### QR (QR v0.5.0)

- 4 params en orden: `nif`, `numserie`, `fecha` (DD‑MM‑AAAA), `importe` (`.`, ≤12+2). URL‑encoding UTF‑8. Opcionales `idioma`, `formato=json` (nunca en el QR de la factura).
- Cotejo: prod `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR`; pruebas `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`.
- Físico: ISO/IEC 18004:2015, **30×30–40×40 mm**, **nivel de corrección M** (no L), zona de silencio ≥2 mm (rec. 6), texto «QR tributario:» encima y, en verificables, «Factura verificable en la sede electrónica de la AEAT» / «VERI\*FACTU».

## 9. Análisis de brechas vs. el repo

| #   | Requisito oficial                                                  | ¿Implementado?       | Qué falta                                                                                                                             |
| --- | ------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Huella SHA‑256 encadenada** (Alta 8 / Anulación 5, hex MAYÚS 64) | **HECHO**            | Verificado contra vectores oficiales. Encadenamiento con huella completa (correcto).                                                  |
| 2   | **QR tributario**                                                  | **PARCIAL**          | `build_qr_data` correcto. Falta **render físico** nivel M, 30‑40 mm y textos obligatorios en la impresión ESC/POS.                    |
| 3   | **Encadenamiento** (orden cronológico de generación, cadena única) | **HECHO**            | Verificar que el orden de inserción sea estrictamente cronológico de generación, nunca por nº/fecha de factura.                       |
| 4   | **Registro de eventos** (art. 8.3 RD; art. 9 Orden)                | **FALTA**            | En VeriFactu reducido (exento arts. 8‑9 Orden); imprescindible si alguna vez se opera NO VeriFactu.                                   |
| 5   | **Bloque `SistemaInformatico`** (9 subcampos)                      | **FALTA**            | Sin él → rechazo estructural (`SoapFault`). Fijar `IdSistemaInformatico`, `NumeroInstalacion` único, indicadores multi‑OT.            |
| 6   | **XML conforme al XSD** (`SuministroLR.xsd`)                       | **FALTA**            | El payload es JSONB interno; no hay serialización al XSD `tikeV1.0`.                                                                  |
| 7   | **Firma (XAdES)**                                                  | **N/A en VeriFactu** | No requerida en VeriFactu (art. 16.3). Solo si se eligiera NO VeriFactu.                                                              |
| 8   | **Transporte SOAP 1.1 document/literal**                           | **FALTA**            | Solo `SandboxProvider`. Falta cliente SOAP real (soapAction vacío, UTF‑8, lote ≤1.000).                                               |
| 9   | **mTLS / certificado cualificado**                                 | **FALTA**            | Sin carga de cert X.509 ni handshake cliente. Decidir modelo: cert propio del SaaS vía Convenio 17 + `<Representante>`.               |
| 10  | **Manejo de respuesta / CSV / estados / errores**                  | **FALTA**            | Parsear `EstadoEnvio`/`EstadoRegistro`, **persistir CSV**, `CodigoErrorRegistro`, duplicados, subsanación/reenvío.                    |
| 11  | **Control de flujo** (`TiempoEsperaEnvio` dinámico, lote 1.000)    | **PARCIAL**          | Hay cola con SKIP LOCKED + advisory lock + `MAX_ATTEMPTS=5`, pero no respeta el `TiempoEsperaEnvio` de la AEAT ni el batching ≤1.000. |
| 12  | **Declaración responsable**                                        | **FALTA**            | No emitida ni visible en producto (art. 13; ausencia sancionable 201 bis.1.f).                                                        |
| 13  | **Modelo de datos + RLS + reintentos**                             | **HECHO**            | `VerifactuRecord` con RLS, estados, `attempts`/`lastError`/`sentAt`; endpoints retry y list.                                          |
| 14  | **Backoffice / UI**                                                | **PARCIAL**          | Vista `/verifactu` oculta con KPIs + badge. Falta lista de registros y UI de certificado.                                             |
| 15  | **Plazos**                                                         | **HECHO** (alineado) | 1‑ene‑2027 / 1‑jul‑2027; anclar la fuente al **RD‑ley 15/2025** (no al RD 254/2025).                                                  |

## 10. Correcciones a afirmaciones previas

1. **«Encadena los primeros 64 caracteres del hash»** → **REFUTADO** (0/3/0): huella **completa** = 64 hex, sin truncamiento. El repo lo hace bien.
2. **«Ambos modos requieren firma»** → **FALSO**: VeriFactu exento (art. 16.3); solo NO VeriFactu firma. Obligación en art. 12, exención en 16.3.
3. **Plazos «tras RD 254/2025» (2026)** → **DESACTUALIZADOS**: las fechas vigentes (2027) las fija el **RD‑ley 15/2025**.
4. **«La rama de certificación del 201 bis no se activa»** → **matiz**: no hay certificación de tercero, pero la rama 201 bis.1.f) **sí se activa**, satisfecha por la declaración responsable; no emitirla es sancionable.
5. **Coste certificados** → confirmado (FNMT 14/0/24 € sin IVA). **Gratuidad de la remisión** → **NO confirmada por fuente literal** (inferencia).
6. **App básica gratuita** → confirmada, pero **no admite tickets** ni exportación → no sirve para un TPV.
7. **«Terceros pueden presentar por sus clientes»** → **confirmado** (Convenio 17 + `<Representante>`; no exime al obligado).
8. **Lote máximo** → 1.000 por envío (no 10.000).
9. **Endpoints alta/consulta** → mismo port `VerifactuSOAP`; la distinción real es VeriFactu vs Requerimiento y cert estándar (www1) vs sello (www10).

## 11. Recomendación de implementación priorizada (SaaS multi‑tienda)

Camino crítico = **capa de transporte real en modalidad VERI\*FACTU** (evita XAdES):

1. **[P0] XML conforme al XSD `tikeV1.0`** (`SuministroLR.xsd`): `RegistroAlta`/`RegistroAnulacion` con `Cabecera` (incl. `<Representante>`), **bloque `SistemaInformatico` completo** y `Encadenamiento`. Validar contra el XSD en CI.
2. **[P0] Cliente SOAP 1.1 document/literal sobre HTTPS con mTLS** (cert cualificado cliente; soapAction vacío, UTF‑8). `VerifactuProvider` real junto al `SandboxProvider`.
3. **[P0] Manejo de respuesta**: `EstadoEnvio`/`RespuestaLinea`, **persistir CSV**, `CodigoErrorRegistro`, duplicados, transiciones SENT/FAILED; «AceptadoConErrores» = registrado.
4. **[P0] Control de flujo y batching**: lotes **≤1.000**, respetar el **`TiempoEsperaEnvio` dinámico** (no fijar 60 s) en `process_pending_batch`.
5. **[P1] Colaboración social**: suscribir el **Convenio 17**, un único cert propio del SaaS, flujo de otorgamiento electrónico de representación por tenant; mapear `<Representante>`.
6. **[P1] Declaración responsable**: generar (art. 15) y mostrar visible en producto y en cada versión.
7. **[P1] QR físico**: nivel M, 30‑40 mm, textos obligatorios.
8. **[P2] Registro de eventos** mínimo.
9. **[P2] Entorno de pruebas** `prewww1.aeat.es` en pipeline.
10. **[P2] UI de certificado** y lista de registros en `/verifactu`.

> **Decisión arquitectónica clave: operar SIEMPRE en modalidad VERI\*FACTU.** Elimina la firma XAdES por registro, la conservación local obligatoria y el registro de eventos completo, y da la presunción de cumplimiento «por diseño» (art. 16.2). Encaja con el SaaS multi‑tienda y con lo ya construido.

## 12. Puntos no resueltos (confirmar con AEAT / asesor fiscal)

1. **Plazo máximo concreto de remisión** (horas/días) en VeriFactu: leer la Orden HAC/1177/2024 ([BOE-A-2024-22138](https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138)) antes de fijarlo en el worker.
2. **Autenticación**: confirmar si es solo mTLS de transporte o además firma **WS‑Security** a nivel de mensaje.
3. **Gratuidad de la remisión**: sin cita literal oficial.
4. **Operativa de preproducción**: credenciales/NIF de prueba, alta del desarrollador.
5. **Plantilla vigente de la declaración responsable** (`EjemplosDeclaracionResponsable(V0.5.1).pdf`).
6. **Alta del Convenio 17** y otorgamiento de representación electrónica (Resolución 18‑12‑2024, [BOE-A-2024-27600](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27600)).
7. **Lista completa de `CodigoErrorRegistro` (L20)**: en el documento de validaciones del Portal de Desarrolladores (necesaria para el manejo de errores P0).
8. **Tramitación parlamentaria posterior** del RD‑ley 15/2025: convalidado (BOE-A-2025-25695); verificar que no haya norma posterior.

---

**Ficheros del repo relevantes**: `crates/domain/src/verifactu/hash.rs` (huella + QR + vectores), `record.rs` (modelo `VerifactuRecord`), `queue.rs` (cola/reintentos), `mod.rs`.
