use rust_decimal::Decimal;
use std::str::FromStr;

fn d(s: &str) -> Decimal {
    Decimal::from_str(s).expect("pricing literal")
}

// Precios en EUR por 1M de tokens (input / output). Fuentes: páginas de pricing
// de OpenAI y Anthropic. Tipo de cambio USD→EUR ~0.95 (conservador; el tracking
// de gasto es orientativo, no facturación exacta).
const USD_EUR_STR: &str = "0.95";

pub struct ModelPricing {
    pub input_per_m: Decimal,  // EUR/1M tokens
    pub output_per_m: Decimal, // EUR/1M tokens
}

pub fn pricing_for(model: &str) -> ModelPricing {
    let usd_eur = d(USD_EUR_STR);

    let (input_usd, output_usd): (Decimal, Decimal) = match model {
        // OpenAI — precios en USD/1M tokens (2025-06)
        "gpt-4.1" => (d("2.00"), d("8.00")),
        "gpt-4.1-mini" => (d("0.40"), d("1.60")),
        "gpt-4.1-nano" => (d("0.10"), d("0.40")),
        "gpt-4o" => (d("2.50"), d("10.00")),
        "gpt-4o-mini" => (d("0.15"), d("0.60")),
        "o3" => (d("10.00"), d("40.00")),
        "o4-mini" => (d("1.10"), d("4.40")),
        // Anthropic — precios en USD/1M tokens (2025-06)
        "claude-opus-4-8" | "claude-opus-4" | "claude-opus-4-8-20251101" => {
            (d("15.00"), d("75.00"))
        }
        "claude-sonnet-4-6" | "claude-sonnet-4" | "claude-sonnet-4-6-20251001" => {
            (d("3.00"), d("15.00"))
        }
        "claude-haiku-4-5" | "claude-haiku-4" | "claude-haiku-4-5-20251001" => {
            (d("0.80"), d("4.00"))
        }
        // Fallback conservador
        _ => (d("5.00"), d("20.00")),
    };

    ModelPricing {
        input_per_m: input_usd * usd_eur,
        output_per_m: output_usd * usd_eur,
    }
}

pub fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> Decimal {
    let p = pricing_for(model);
    let m = d("1000000");
    let input_cost = p.input_per_m * Decimal::from(input_tokens) / m;
    let output_cost = p.output_per_m * Decimal::from(output_tokens) / m;
    (input_cost + output_cost).round_dp(4)
}

// Estimación de tokens para mensajes parciales (abort antes del evento usage).
// ~4 chars/token para input (prompt + historial), ~3 chars/token para output.
pub fn estimate_tokens(input_chars: usize, output_chars: usize) -> (u32, u32) {
    let input = (input_chars / 4).max(1) as u32;
    let output = (output_chars / 3) as u32;
    (input, output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pricing_aplica_tipo_de_cambio_usd_eur() {
        // gpt-4.1: 2.00 USD input · 0.95 = 1.90 EUR/1M; 8.00 · 0.95 = 7.60 EUR/1M
        let p = pricing_for("gpt-4.1");
        assert_eq!(p.input_per_m, d("1.90"));
        assert_eq!(p.output_per_m, d("7.60"));
    }

    #[test]
    fn pricing_resuelve_alias_de_modelo() {
        // Los alias con fecha resuelven al mismo precio que el id base.
        let base = pricing_for("claude-opus-4-8");
        let alias = pricing_for("claude-opus-4-8-20251101");
        assert_eq!(base.input_per_m, alias.input_per_m);
        assert_eq!(base.output_per_m, alias.output_per_m);
        // 15.00 · 0.95 = 14.25 EUR/1M input
        assert_eq!(base.input_per_m, d("14.25"));
    }

    #[test]
    fn pricing_modelo_desconocido_usa_fallback_conservador() {
        let p = pricing_for("modelo-inexistente-xyz");
        // Fallback 5.00/20.00 USD · 0.95
        assert_eq!(p.input_per_m, d("4.75"));
        assert_eq!(p.output_per_m, d("19.00"));
    }

    #[test]
    fn calculate_cost_un_millon_de_cada_es_input_mas_output_por_m() {
        // 1M input + 1M output con gpt-4.1 = 1.90 + 7.60 = 9.50 EUR
        let cost = calculate_cost("gpt-4.1", 1_000_000, 1_000_000);
        assert_eq!(cost, d("9.5000"));
    }

    #[test]
    fn calculate_cost_redondea_a_cuatro_decimales() {
        // input 1000 · 1.90/1M = 0.0019; output 500 · 7.60/1M = 0.0038 → 0.0057
        let cost = calculate_cost("gpt-4.1", 1000, 500);
        assert_eq!(cost, d("0.0057"));
        assert_eq!(cost.scale(), 4);
    }

    #[test]
    fn calculate_cost_cero_tokens_es_cero() {
        assert_eq!(calculate_cost("gpt-4.1", 0, 0), Decimal::ZERO);
    }

    #[test]
    fn estimate_tokens_usa_4_y_3_chars_por_token() {
        assert_eq!(estimate_tokens(400, 300), (100, 100));
        assert_eq!(estimate_tokens(40, 9), (10, 3));
    }

    #[test]
    fn estimate_tokens_input_minimo_uno() {
        // Aunque el input sea vacío, se cuenta al menos 1 token de input
        // (system prompt siempre presente); el output vacío sí es 0.
        assert_eq!(estimate_tokens(0, 0), (1, 0));
        assert_eq!(estimate_tokens(3, 0), (1, 0));
    }
}
