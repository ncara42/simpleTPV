//! Renderizado del DOCUMENTO FISCAL imprimible de una venta (#152) — port de
//! `apps/api/src/sales/sales-receipt.ts`. Factura simplificada / ticket en HTML
//! autocontenido (estilos embebidos, incl. `@media print`). Función pura, sin BD
//! ni tenant: recibe el [`TicketData`] ya cargado y devuelve el HTML.
//!
//! SEGURIDAD: todo texto dinámico (nombre de organización/tienda, productos) lo
//! introduce el personal del tenant → SIEMPRE se escapa con [`escape_html`]
//! antes de interpolarlo (XSS almacenado al abrir el documento).

use rust_decimal::Decimal;
use time::PrimitiveDateTime;
use time_tz::{timezones, OffsetDateTimeExt};

use crate::sales::domain::TaxBreakdownItem;
use crate::sales::model::{PaymentMethod, TicketData, TicketLine};

// La URL base de cotejo AEAT vive en verifactu::hash (configurable por env,
// default producción; #156 H-03). Aquí se reutiliza para el enlace del recibo.

/// Importe en euros con formato español: coma decimal y 2 decimales ("24,90 €").
/// Determinista (sin `Intl`): los importes ya son `Decimal(12,2)` exactos.
fn eur(v: Decimal) -> String {
    format!("{v:.2} €").replace('.', ",")
}

/// Número "crudo" (cantidad / % de descuento) sin ceros sobrantes: `2`, `1.5`,
/// `10` — paridad con `num(v)` de NestJS (que imprime el `Number` tal cual).
fn num_str(v: Decimal) -> String {
    v.normalize().to_string()
}

/// Fecha española `dd/mm/aaaa, hh:mm` anclada a Europe/Madrid (DST correcto vía
/// `time-tz`), determinista sea cual sea la TZ del host. Paridad con el `Intl`
/// es-ES de NestJS, que separa fecha y hora con ", ".
fn format_date_es(dt: PrimitiveDateTime) -> String {
    let local = dt.assume_utc().to_timezone(timezones::db::europe::MADRID);
    format!(
        "{:02}/{:02}/{:04}, {:02}:{:02}",
        local.day(),
        local.month() as u8,
        local.year(),
        local.hour(),
        local.minute(),
    )
}

/// Escapa los 5 caracteres peligrosos en contexto HTML (texto y atributos). El
/// orden importa: `&` primero para no re-escapar las entidades que se generan.
fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn payment_label(method: PaymentMethod) -> String {
    match method {
        PaymentMethod::Cash => "Efectivo".to_owned(),
        PaymentMethod::Card => "Tarjeta".to_owned(),
        PaymentMethod::Transfer => "Transferencia".to_owned(),
        PaymentMethod::Bizum => "Bizum".to_owned(),
        PaymentMethod::DirectDebit => "Domiciliado".to_owned(),
    }
}

/// Genera el `<svg>` del código QR de cotejo VERI\*FACTU. La norma técnica de la
/// AEAT exige un QR ISO/IEC 18004 con **nivel de corrección M**; el tamaño físico
/// (30–40 mm) lo fija el CSS del recibo. Devuelve cadena vacía si la generación
/// falla: el ticket nunca debe dejar de emitirse por el QR.
fn build_qr_svg(qr_data: &str) -> String {
    use qrcode::render::svg;
    use qrcode::{EcLevel, QrCode};
    match QrCode::with_error_correction_level(qr_data, EcLevel::M) {
        Ok(code) => code
            .render()
            .min_dimensions(132, 132)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#ffffff"))
            .build(),
        Err(_) => String::new(),
    }
}

fn render_line_rows(lines: &[TicketLine]) -> String {
    lines
        .iter()
        .map(|l| {
            let discount = if l.discount_pct > Decimal::ZERO {
                format!("\u{2212}{}%", num_str(l.discount_pct))
            } else if l.discount_amt > Decimal::ZERO {
                format!("\u{2212}{}", eur(l.discount_amt))
            } else {
                "\u{2014}".to_owned()
            };
            format!(
                "<tr>
            <td class=\"concept\">{}</td>
            <td class=\"num\">{}</td>
            <td class=\"num\">{}</td>
            <td class=\"num\">{}</td>
            <td class=\"num\">{}</td>
          </tr>",
                escape_html(&l.name),
                num_str(l.qty),
                eur(l.unit_price),
                discount,
                eur(l.line_total),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_tax_rows(items: &[TaxBreakdownItem]) -> String {
    items
        .iter()
        .map(|t| {
            format!(
                "<tr>
            <td>IVA {}%</td>
            <td class=\"num\">{}</td>
            <td class=\"num\">{}</td>
          </tr>",
                num_str(t.tax_rate),
                eur(t.base),
                eur(t.cuota),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// Estilos embebidos (pantalla + impresión). Bloque estático con llaves CSS → va
// como literal aparte para no chocar con los `{}` de `format!`.
const RECEIPT_STYLE: &str = r#"<style>
  :root {
    --ink: #1a1a1a;
    --muted: #6b7280;
    --border: #d1d5db;
    --brand: #166534;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 24px;
    font-size: 14px;
    line-height: 1.45;
  }
  .receipt { max-width: 720px; margin: 0 auto; }
  header.doc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid var(--brand);
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .doc-title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 4px; }
  .org-name { font-size: 20px; font-weight: 700; }
  .org-nif { display: block; color: var(--muted); font-size: 13px; }
  .doc-meta { text-align: right; font-size: 13px; color: var(--muted); }
  .doc-meta strong { display: block; color: var(--ink); font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 6px 8px; text-align: left; }
  thead th { border-bottom: 1px solid var(--border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  tbody td { border-bottom: 1px solid #f0f0f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.concept { width: 50%; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 3px 8px; }
  .total-row.grand { border-top: 2px solid var(--ink); margin-top: 6px; padding-top: 8px; font-size: 18px; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; }
  .tax-table { margin-top: 4px; }
  .tax-table caption { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); padding: 0 8px; }
  .pay { margin-top: 16px; font-size: 13px; }
  footer.cotejo {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    word-break: break-all;
  }
  footer.cotejo a { color: var(--brand); }
  .vf-qr { margin: 0 auto 8px; width: 35mm; }
  .vf-qr svg { width: 35mm; height: 35mm; display: block; margin: 0 auto; }
  .vf-mark { font-weight: 700; letter-spacing: 0.12em; color: var(--ink); font-size: 12px; }
  .vf-legend { margin-bottom: 6px; color: var(--ink); }
  @media print {
    body { padding: 0; font-size: 12px; }
    .receipt { max-width: none; }
    @page { margin: 12mm; }
  }
</style>"#;

/// Devuelve el documento HTML completo (factura simplificada) de la venta.
/// Autocontenido: lleva sus propios estilos (pantalla + impresión).
pub fn render_receipt_html(data: &TicketData) -> String {
    let is_cash = data.payment_method == PaymentMethod::Cash;
    // Bloque de cotejo VERI\*FACTU: QR escaneable + leyenda oficial. Solo se emite
    // si la organización tiene NIF (sin NIF no hay registro fiscal que cotejar). El
    // QR codifica la URL oficial de la AEAT con los parámetros en el ORDEN de la
    // spec (nif, numserie, fecha DD-MM-AAAA, importe) — reutiliza `build_qr_data`.
    let cotejo_block = match data.organization.nif.as_deref() {
        Some(nif) if !nif.is_empty() => {
            let fecha = {
                let local = data
                    .created_at
                    .assume_utc()
                    .to_timezone(timezones::db::europe::MADRID);
                crate::verifactu::hash::format_fecha_expedicion(local)
            };
            let qr_url =
                crate::verifactu::hash::build_qr_data(nif, &data.ticket_number, &fecha, data.total);
            let qr_svg = build_qr_svg(&qr_url);
            let qr_url_esc = escape_html(&qr_url);
            format!(
                r#"<footer class="cotejo" data-testid="receipt-cotejo">
    <div class="vf-qr" data-testid="receipt-qr">{qr_svg}</div>
    <div class="vf-mark">VERI*FACTU</div>
    <div class="vf-legend">Factura verificable en la sede electrónica de la AEAT</div>
    <a href="{qr_url_esc}">{qr_url_esc}</a>
  </footer>"#
            )
        }
        _ => String::new(),
    };

    let nif_line = match &data.organization.nif {
        Some(nif) => format!("<span class=\"org-nif\">NIF {}</span>", escape_html(nif)),
        None => String::new(),
    };
    let discount_row = if data.discount_total > Decimal::ZERO {
        format!(
            "<div class=\"total-row\"><span>Descuento</span><span class=\"num\">\u{2212}{}</span></div>",
            eur(data.discount_total)
        )
    } else {
        String::new()
    };
    let cash_rows = if is_cash && data.cash_given.is_some() {
        format!(
            "<div class=\"total-row\"><span>Entregado</span><span class=\"num\">{}</span></div>\n        <div class=\"total-row\"><span>Cambio</span><span class=\"num\">{}</span></div>",
            eur(data.cash_given.unwrap_or(Decimal::ZERO)),
            eur(data.cash_change.unwrap_or(Decimal::ZERO)),
        )
    } else {
        String::new()
    };

    let mut out = String::with_capacity(4096);
    out.push_str("<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\" />\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n<title>Factura simplificada ");
    out.push_str(&escape_html(&data.ticket_number));
    out.push_str("</title>\n");
    out.push_str(RECEIPT_STYLE);
    out.push_str("\n</head>\n<body>\n");
    out.push_str(&format!(
        r#"<main class="receipt" data-testid="receipt-doc">
  <header class="doc-head">
    <div>
      <p class="doc-title">Factura simplificada</p>
      <span class="org-name">{org_name}</span>
      {nif_line}
    </div>
    <div class="doc-meta">
      <strong>{ticket}</strong>
      <span>{store_name} ({store_code})</span>
      <span>{date}</span>
    </div>
  </header>

  <table class="lines">
    <thead>
      <tr>
        <th class="concept">Concepto</th>
        <th class="num">Cant.</th>
        <th class="num">P. unit.</th>
        <th class="num">Dto.</th>
        <th class="num">Importe</th>
      </tr>
    </thead>
    <tbody>
{line_rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span class="num">{subtotal}</span></div>
    {discount_row}
    <div class="total-row grand"><span>Total</span><span class="num">{total}</span></div>
  </div>

  <table class="tax-table">
    <caption>Desglose de IVA</caption>
    <thead>
      <tr><th>Tipo</th><th class="num">Base</th><th class="num">Cuota</th></tr>
    </thead>
    <tbody>
{tax_rows}
    </tbody>
  </table>

  <div class="pay">
    <div class="total-row"><span>Método de pago</span><span>{pay_label}</span></div>
    {cash_rows}
  </div>

  {cotejo_block}
</main>
</body>
</html>"#,
        org_name = escape_html(&data.organization.name),
        nif_line = nif_line,
        ticket = escape_html(&data.ticket_number),
        store_name = escape_html(&data.store.name),
        store_code = escape_html(&data.store.code),
        date = format_date_es(data.created_at),
        line_rows = render_line_rows(&data.lines),
        subtotal = eur(data.subtotal),
        discount_row = discount_row,
        total = eur(data.total),
        tax_rows = render_tax_rows(&data.tax_breakdown),
        pay_label = payment_label(data.payment_method),
        cash_rows = cash_rows,
        cotejo_block = cotejo_block,
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sales::model::{OrgInfo, StoreInfo};
    use time::macros::datetime;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    fn line(name: &str, qty: &str, unit: &str, pct: &str, amt: &str, total: &str) -> TicketLine {
        TicketLine {
            name: name.into(),
            qty: dec(qty),
            unit_price: dec(unit),
            discount_pct: dec(pct),
            discount_amt: dec(amt),
            line_total: dec(total),
        }
    }

    fn make_data() -> TicketData {
        TicketData {
            organization: OrgInfo {
                name: "Verde SL".into(),
                nif: Some("B12345678".into()),
            },
            store: StoreInfo {
                name: "Tienda Centro".into(),
                code: "01".into(),
            },
            ticket_number: "T01-000042".into(),
            created_at: datetime!(2026-06-02 12:05:00),
            lines: vec![
                line("Aceite CBD 10%", "1", "24.90", "0", "0", "24.90"),
                line("Flor Lemon Haze 2g", "2", "14.50", "0", "0", "29.00"),
            ],
            subtotal: dec("53.90"),
            discount_total: dec("0"),
            total: dec("53.90"),
            payment_method: PaymentMethod::Cash,
            cash_given: Some(dec("60.00")),
            cash_change: Some(dec("6.10")),
            tax_breakdown: vec![TaxBreakdownItem {
                tax_rate: dec("21"),
                base: dec("44.55"),
                cuota: dec("9.35"),
            }],
        }
    }

    #[test]
    fn eur_formato_espanol() {
        assert_eq!(eur(dec("24.90")), "24,90 €");
        assert_eq!(eur(dec("14.5")), "14,50 €");
        assert_eq!(eur(dec("0")), "0,00 €");
    }

    #[test]
    fn escape_html_caracteres_peligrosos() {
        assert_eq!(
            escape_html("<script>alert(\"x\")</script>"),
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
        );
        assert_eq!(escape_html("O'Brien & co"), "O&#39;Brien &amp; co");
    }

    #[test]
    fn format_date_es_anclado_a_madrid_cest() {
        // 12:05 UTC el 2 de junio (CEST, +2) → 14:05 hora local de Madrid.
        assert_eq!(
            format_date_es(datetime!(2026-06-02 12:05:00)),
            "02/06/2026, 14:05"
        );
    }

    #[test]
    fn format_date_es_invierno_cet() {
        // 12:05 UTC el 2 de enero (CET, +1) → 13:05 hora local de Madrid.
        assert_eq!(
            format_date_es(datetime!(2026-01-02 12:05:00)),
            "02/01/2026, 13:05"
        );
    }

    #[test]
    fn render_documento_con_datos_fiscales() {
        let html = render_receipt_html(&make_data());
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<html lang=\"es\">"));
        assert!(html.contains("Factura simplificada"));
        assert!(html.contains("Verde SL"));
        assert!(html.contains("NIF B12345678"));
        assert!(html.contains("T01-000042"));
        assert!(html.contains("Tienda Centro (01)"));
        assert!(html.contains("Aceite CBD 10%"));
        assert!(html.contains("Flor Lemon Haze 2g"));
    }

    #[test]
    fn render_desglose_iva_total_subtotal_pago() {
        let html = render_receipt_html(&make_data());
        assert!(html.contains("IVA 21%"));
        assert!(html.contains("44,55 €"));
        assert!(html.contains("9,35 €"));
        assert!(html.contains("Subtotal"));
        assert!(html.contains("53,90 €"));
        assert!(html.contains("Efectivo"));
    }

    #[test]
    fn render_cash_muestra_entregado_y_cambio() {
        let html = render_receipt_html(&make_data());
        assert!(html.contains("Entregado"));
        assert!(html.contains("60,00 €"));
        assert!(html.contains("Cambio"));
        assert!(html.contains("6,10 €"));
    }

    #[test]
    fn render_card_sin_entregado_ni_cambio() {
        let mut d = make_data();
        d.payment_method = PaymentMethod::Card;
        d.cash_given = None;
        d.cash_change = None;
        let html = render_receipt_html(&d);
        assert!(html.contains("Tarjeta"));
        assert!(!html.contains("Entregado"));
        assert!(!html.contains("Cambio"));
    }

    #[test]
    fn render_omite_nif_cuando_falta() {
        let mut d = make_data();
        d.organization = OrgInfo {
            name: "Herbolario Verde".into(),
            nif: None,
        };
        let html = render_receipt_html(&d);
        assert!(html.contains("Herbolario Verde"));
        assert!(!html.contains(">NIF "));
    }

    #[test]
    fn render_fila_descuento_solo_si_hay() {
        let sin = render_receipt_html(&make_data());
        assert!(!sin.contains("Descuento"));
        let mut con = make_data();
        con.discount_total = dec("5.40");
        con.total = dec("48.50");
        let html = render_receipt_html(&con);
        assert!(html.contains("Descuento"));
        assert!(html.contains("\u{2212}5,40 €"));
    }

    #[test]
    fn render_descuento_de_linea_por_pct_y_por_importe() {
        let mut d = make_data();
        d.lines = vec![
            line("Pct", "1", "10", "10", "0", "9"),
            line("Amt", "1", "10", "0", "2", "8"),
        ];
        let html = render_receipt_html(&d);
        assert!(html.contains("\u{2212}10%"));
        assert!(html.contains("\u{2212}2,00 €"));
    }

    #[test]
    fn render_escapa_xss() {
        let mut d = make_data();
        d.organization = OrgInfo {
            name: "<script>alert(1)</script>".into(),
            nif: Some("B1".into()),
        };
        d.lines = vec![line(
            "<img src=x onerror=alert(1)>",
            "1",
            "1",
            "0",
            "0",
            "1",
        )];
        let html = render_receipt_html(&d);
        assert!(!html.contains("<script>alert(1)</script>"));
        assert!(!html.contains("<img src=x"));
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("&lt;img src=x"));
    }

    #[test]
    fn render_qr_y_leyenda_verifactu() {
        let html = render_receipt_html(&make_data());
        // Marca y leyenda OFICIALES exigidas en el documento.
        assert!(html.contains("VERI*FACTU"));
        assert!(html.contains("Factura verificable en la sede electrónica de la AEAT"));
        // QR escaneable embebido (SVG) con su data-testid.
        assert!(html.contains("data-testid=\"receipt-qr\""));
        assert!(html.contains("<svg"));
        // URL de cotejo AEAT con los 4 parámetros oficiales (incl. fecha, que el
        // enlace antiguo omitía). Host robusto a pre/producción (configurable env).
        assert!(html.contains("/wlpl/TIKE-CONT/ValidarQR"));
        assert!(html.contains("nif=B12345678"));
        assert!(html.contains("numserie=T01-000042"));
        assert!(html.contains("fecha=02-06-2026"));
        assert!(html.contains("importe=53.90"));
    }

    #[test]
    fn render_sin_qr_cuando_falta_nif() {
        // Sin NIF no hay registro fiscal que cotejar → no se emite QR ni leyenda.
        let mut d = make_data();
        d.organization = OrgInfo {
            name: "Herbolario Verde".into(),
            nif: None,
        };
        let html = render_receipt_html(&d);
        assert!(!html.contains("data-testid=\"receipt-qr\""));
        assert!(!html.contains("VERI*FACTU"));
    }

    #[test]
    fn render_estilos_de_impresion() {
        assert!(render_receipt_html(&make_data()).contains("@media print"));
    }

    #[test]
    fn render_iva_vacio_sin_crash() {
        let mut d = make_data();
        d.tax_breakdown = vec![];
        let html = render_receipt_html(&d);
        assert!(html.contains("Desglose de IVA"));
        assert!(!html.contains("IVA "));
    }
}
