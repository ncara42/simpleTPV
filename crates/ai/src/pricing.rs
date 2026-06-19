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
