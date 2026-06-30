# XSD oficiales VERI\*FACTU (AEAT) — fixtures de validación

Suelta aquí los esquemas **oficiales** del paquete `tikeV1.0` de la AEAT. El test
`crates/domain/tests/verifactu_xsd_validation.rs` valida el XML que genera
`aeat/xml.rs` contra `SuministroLR.xsd` usando `xmllint`.

> Mientras esta carpeta no tenga los `.xsd`, el test **se omite** (no rompe el gate).
> En cuanto estén, valida automáticamente (local con `xmllint` instalado, y en CI).

## Qué descargar

Portal de desarrolladores de la AEAT → «Sistemas Informáticos de Facturación y
Sistemas VERI\*FACTU» → Diseños de registro / Esquemas (los referencia el WSDL
`SistemaFacturacion.wsdl`):

| Fichero                                          | Para qué                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `SuministroLR.xsd`                               | **Obligatorio.** Define `RegFactuSistemaFacturacion` (lo que enviamos).                                            |
| `SuministroInformacion.xsd`                      | **Obligatorio.** Tipos comunes (`RegistroAlta`/`RegistroAnulacion`, `Desglose`, …); lo importa `SuministroLR.xsd`. |
| `RespuestaSuministro.xsd`                        | Opcional. Solo si además validamos las respuestas de la AEAT.                                                      |
| Cualquier `.xsd` que estos **importen/incluyan** | Necesario para que `xmllint` resuelva las referencias.                                                             |

## Requisitos de colocación

- **Todos los `.xsd` en esta misma carpeta.** `xmllint` resuelve los
  `xsd:import`/`xsd:include` por su `schemaLocation` relativo al fichero.
- Si algún `schemaLocation` apunta a una **URL absoluta** de la AEAT (en vez de un
  nombre de fichero relativo), reescríbelo al nombre local (p. ej.
  `schemaLocation="SuministroInformacion.xsd"`) o añade un catálogo XML. Sin esto
  `xmllint` intentaría descargarlo y fallaría sin red.
- No los renombres: el test busca `SuministroLR.xsd` exactamente.

## Verificar a mano

```bash
xmllint --noout --schema SuministroLR.xsd <un_RegFactuSistemaFacturacion.xml>
```

## Nota sobre el namespace

`aeat/xml.rs` declara los namespaces en `NS_LR`/`NS_SF`. Deben coincidir
**exactamente** con el `targetNamespace` de estos XSD; si no, `xmllint` (y la AEAT)
rechazan el documento. Si la validación falla por el namespace, hay que alinear las
constantes con el valor oficial de los esquemas.
