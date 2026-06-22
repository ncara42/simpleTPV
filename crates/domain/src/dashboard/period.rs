//! Resolución de periodos del dashboard (#154, Fase 4) — port de `period.ts`.
//! Devuelve rangos semiabiertos `[from, to)`. Funciones PURAS (reciben `now`)
//! para testear sin reloj. Se interpreta en UTC (misma convención que el resto
//! del port; NestJS usaba la TZ del servidor — deuda conocida del MVP).
//!
//! Estas primitivas son la base de TODOS los endpoints de KPIs del dashboard
//! (ventas, márgenes, rotación, rankings…), que se portan sobre ellas.

use simpletpv_shared::AppError;
use time::macros::format_description;
use time::{Date, Duration, Month, PrimitiveDateTime, Time};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DashboardPeriod {
    Today,
    Yesterday,
    /// Periodos «hasta hoy» (acumulado del periodo en curso).
    Week,
    Month,
    Quarter,
    Year,
    /// Periodos cerrados anteriores (rango completo, para comparar contra el actual).
    LastWeek,
    LastMonth,
    LastQuarter,
    LastYear,
    Custom,
}

impl DashboardPeriod {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "today" => Self::Today,
            "yesterday" => Self::Yesterday,
            "week" => Self::Week,
            "month" => Self::Month,
            "quarter" => Self::Quarter,
            "year" => Self::Year,
            "last_week" => Self::LastWeek,
            "last_month" => Self::LastMonth,
            "last_quarter" => Self::LastQuarter,
            "last_year" => Self::LastYear,
            "custom" => Self::Custom,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateRange {
    pub from: PrimitiveDateTime,
    pub to: PrimitiveDateTime,
}

fn start_of_day(d: PrimitiveDateTime) -> PrimitiveDateTime {
    PrimitiveDateTime::new(d.date(), Time::MIDNIGHT)
}

fn add_days(d: PrimitiveDateTime, days: i64) -> PrimitiveDateTime {
    d + Duration::days(days)
}

/// Lunes de la semana de `d` (semana ISO: lunes = inicio).
fn start_of_week(d: PrimitiveDateTime) -> PrimitiveDateTime {
    let s = start_of_day(d);
    let from_monday = s.date().weekday().number_days_from_monday() as i64;
    add_days(s, -from_monday)
}

fn start_of_month(d: PrimitiveDateTime) -> PrimitiveDateTime {
    let date = Date::from_calendar_date(d.year(), d.month(), 1).expect("día 1 válido");
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
}

fn start_of_year(d: PrimitiveDateTime) -> PrimitiveDateTime {
    let date = Date::from_calendar_date(d.year(), Month::January, 1).expect("1 de enero válido");
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
}

/// Día 1 del trimestre natural de `d` (Q1=ene, Q2=abr, Q3=jul, Q4=oct).
fn start_of_quarter(d: PrimitiveDateTime) -> PrimitiveDateTime {
    let q_first_month = ((u8::from(d.month()) as u32 - 1) / 3) * 3 + 1; // 1, 4, 7, 10
    let month = Month::try_from(q_first_month as u8).expect("mes de trimestre válido");
    let date = Date::from_calendar_date(d.year(), month, 1).expect("día 1 válido");
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
}

/// Suma `months` (puede ser negativo) a una fecha que es DÍA 1 de mes (sin riesgo
/// de recortar el día). Usado por la comparativa mensual.
fn add_months_first(d: PrimitiveDateTime, months: i32) -> PrimitiveDateTime {
    let total = d.year() * 12 + (u8::from(d.month()) as i32 - 1) + months;
    let year = total.div_euclid(12);
    let month = Month::try_from((total.rem_euclid(12) + 1) as u8).expect("mes válido");
    let date = Date::from_calendar_date(year, month, 1).expect("día 1 válido");
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
}

fn add_years_first(d: PrimitiveDateTime, years: i32) -> PrimitiveDateTime {
    let date = Date::from_calendar_date(d.year() + years, d.month(), 1).expect("día 1 válido");
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
}

/// Resuelve un periodo (+ `from`/`to` para `custom`) a un rango `[from, to)`.
pub fn resolve_period(
    period: DashboardPeriod,
    now: PrimitiveDateTime,
    custom_from: Option<&str>,
    custom_to: Option<&str>,
) -> Result<DateRange, AppError> {
    let today_start = start_of_day(now);
    let tomorrow_start = add_days(today_start, 1);
    Ok(match period {
        DashboardPeriod::Today => DateRange {
            from: today_start,
            to: tomorrow_start,
        },
        DashboardPeriod::Yesterday => DateRange {
            from: add_days(today_start, -1),
            to: today_start,
        },
        DashboardPeriod::Week => DateRange {
            from: start_of_week(now),
            to: tomorrow_start,
        },
        DashboardPeriod::Month => DateRange {
            from: start_of_month(now),
            to: tomorrow_start,
        },
        DashboardPeriod::Quarter => DateRange {
            from: start_of_quarter(now),
            to: tomorrow_start,
        },
        DashboardPeriod::Year => DateRange {
            from: start_of_year(now),
            to: tomorrow_start,
        },
        // Periodos cerrados anteriores: rango COMPLETO del periodo previo [inicio, inicio_actual).
        DashboardPeriod::LastWeek => {
            let this_week = start_of_week(now);
            DateRange {
                from: add_days(this_week, -7),
                to: this_week,
            }
        }
        DashboardPeriod::LastMonth => {
            let this_month = start_of_month(now);
            DateRange {
                from: add_months_first(this_month, -1),
                to: this_month,
            }
        }
        DashboardPeriod::LastQuarter => {
            let this_quarter = start_of_quarter(now);
            DateRange {
                from: add_months_first(this_quarter, -3),
                to: this_quarter,
            }
        }
        DashboardPeriod::LastYear => {
            let this_year = start_of_year(now);
            DateRange {
                from: add_years_first(this_year, -1),
                to: this_year,
            }
        }
        DashboardPeriod::Custom => {
            let (Some(from_s), Some(to_s)) = (custom_from, custom_to) else {
                return Err(AppError::BadRequest); // custom requiere from y to
            };
            let fmt = format_description!("[year]-[month]-[day]");
            let from_d = Date::parse(from_s, fmt).map_err(|_| AppError::BadRequest)?;
            let to_d = Date::parse(to_s, fmt).map_err(|_| AppError::BadRequest)?;
            let from = PrimitiveDateTime::new(from_d, Time::MIDNIGHT);
            // `to` es inclusivo en intención del usuario → +1 día para semiabierto.
            let to = add_days(PrimitiveDateTime::new(to_d, Time::MIDNIGHT), 1);
            if to <= from {
                return Err(AppError::BadRequest);
            }
            DateRange { from, to }
        }
    })
}

/// Rango "equivalente anterior": desplaza el rango hacia atrás su propia duración.
pub fn previous_range(range: DateRange) -> DateRange {
    let duration = range.to - range.from;
    DateRange {
        from: range.from - duration,
        to: range.from,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompareMode {
    Day,
    Month,
    Year,
}

impl CompareMode {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "day" => Self::Day,
            "month" => Self::Month,
            "year" => Self::Year,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ComparisonStarts {
    pub current_start: PrimitiveDateTime,
    pub previous_start: PrimitiveDateTime,
    /// Corte "mismo tiempo transcurrido" dentro del periodo anterior.
    pub previous_same_elapsed: PrimitiveDateTime,
}

/// Anclajes para "periodo en curso vs anterior equivalente a la misma altura".
pub fn comparison_starts(compare: CompareMode, now: PrimitiveDateTime) -> ComparisonStarts {
    let current_start = match compare {
        CompareMode::Day => start_of_day(now),
        CompareMode::Month => start_of_month(now),
        CompareMode::Year => start_of_year(now),
    };
    let previous_start = match compare {
        CompareMode::Day => add_days(current_start, -1),
        CompareMode::Month => add_months_first(current_start, -1),
        CompareMode::Year => add_years_first(current_start, -1),
    };
    let elapsed = now - current_start;
    ComparisonStarts {
        current_start,
        previous_start,
        previous_same_elapsed: previous_start + elapsed,
    }
}

/// Delta porcentual (current vs previous). `None` si previous es 0 (evita /0).
pub fn delta_pct(current: f64, previous: f64) -> Option<f64> {
    if previous == 0.0 {
        None
    } else {
        Some((current - previous) / previous * 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    // Miércoles 2026-06-17 14:30.
    fn now() -> PrimitiveDateTime {
        datetime!(2026-06-17 14:30:00)
    }

    #[test]
    fn periodos_estandar() {
        let r = resolve_period(DashboardPeriod::Today, now(), None, None).unwrap();
        assert_eq!(r.from, datetime!(2026-06-17 0:00));
        assert_eq!(r.to, datetime!(2026-06-18 0:00));

        let y = resolve_period(DashboardPeriod::Yesterday, now(), None, None).unwrap();
        assert_eq!(y.from, datetime!(2026-06-16 0:00));
        assert_eq!(y.to, datetime!(2026-06-17 0:00));

        // 2026-06-17 es miércoles → lunes 2026-06-15.
        let w = resolve_period(DashboardPeriod::Week, now(), None, None).unwrap();
        assert_eq!(w.from, datetime!(2026-06-15 0:00));
        assert_eq!(w.to, datetime!(2026-06-18 0:00));

        let m = resolve_period(DashboardPeriod::Month, now(), None, None).unwrap();
        assert_eq!(m.from, datetime!(2026-06-01 0:00));

        let yr = resolve_period(DashboardPeriod::Year, now(), None, None).unwrap();
        assert_eq!(yr.from, datetime!(2026-01-01 0:00));
    }

    #[test]
    fn quarter_acumulado_hasta_hoy() {
        // 2026-06-17 está en Q2 (abr-jun) → desde 1-abr hasta mañana (acumulado).
        let q = resolve_period(DashboardPeriod::Quarter, now(), None, None).unwrap();
        assert_eq!(q.from, datetime!(2026-04-01 0:00));
        assert_eq!(q.to, datetime!(2026-06-18 0:00));
    }

    #[test]
    fn periodos_cerrados_anteriores() {
        // now = miércoles 2026-06-17 → semana en curso desde lunes 15.
        let lw = resolve_period(DashboardPeriod::LastWeek, now(), None, None).unwrap();
        assert_eq!(lw.from, datetime!(2026-06-08 0:00));
        assert_eq!(lw.to, datetime!(2026-06-15 0:00)); // [lun previo, lun actual)

        let lm = resolve_period(DashboardPeriod::LastMonth, now(), None, None).unwrap();
        assert_eq!(lm.from, datetime!(2026-05-01 0:00));
        assert_eq!(lm.to, datetime!(2026-06-01 0:00));

        // Q2 en curso (1-abr) → trimestre anterior Q1 completo [1-ene, 1-abr).
        let lq = resolve_period(DashboardPeriod::LastQuarter, now(), None, None).unwrap();
        assert_eq!(lq.from, datetime!(2026-01-01 0:00));
        assert_eq!(lq.to, datetime!(2026-04-01 0:00));

        let ly = resolve_period(DashboardPeriod::LastYear, now(), None, None).unwrap();
        assert_eq!(ly.from, datetime!(2025-01-01 0:00));
        assert_eq!(ly.to, datetime!(2026-01-01 0:00));
    }

    #[test]
    fn parse_acepta_los_nuevos_tokens() {
        for s in [
            "quarter",
            "last_week",
            "last_month",
            "last_quarter",
            "last_year",
        ] {
            assert!(DashboardPeriod::parse(s).is_some(), "parse {s}");
        }
        assert!(DashboardPeriod::parse("this_month").is_none());
    }

    #[test]
    fn custom_valido_e_invalido() {
        let r = resolve_period(
            DashboardPeriod::Custom,
            now(),
            Some("2026-06-01"),
            Some("2026-06-10"),
        )
        .unwrap();
        assert_eq!(r.from, datetime!(2026-06-01 0:00));
        assert_eq!(r.to, datetime!(2026-06-11 0:00)); // to inclusivo → +1 día

        // Falta from/to.
        assert!(resolve_period(DashboardPeriod::Custom, now(), Some("2026-06-01"), None).is_err());
        // Fecha imposible.
        assert!(resolve_period(
            DashboardPeriod::Custom,
            now(),
            Some("2026-13-45"),
            Some("2026-06-10")
        )
        .is_err());
        // to anterior a from.
        assert!(resolve_period(
            DashboardPeriod::Custom,
            now(),
            Some("2026-06-10"),
            Some("2026-06-01")
        )
        .is_err());
    }

    #[test]
    fn previous_range_desplaza_la_duracion() {
        let today = resolve_period(DashboardPeriod::Today, now(), None, None).unwrap();
        let prev = previous_range(today);
        assert_eq!(prev.from, datetime!(2026-06-16 0:00));
        assert_eq!(prev.to, datetime!(2026-06-17 0:00));
    }

    #[test]
    fn comparativas_con_rollover_de_mes_y_ano() {
        let day = comparison_starts(CompareMode::Day, now());
        assert_eq!(day.current_start, datetime!(2026-06-17 0:00));
        assert_eq!(day.previous_start, datetime!(2026-06-16 0:00));
        assert_eq!(day.previous_same_elapsed, datetime!(2026-06-16 14:30));

        // Enero: el mes anterior es diciembre del año previo.
        let jan = datetime!(2026-01-10 06:00:00);
        let m = comparison_starts(CompareMode::Month, jan);
        assert_eq!(m.current_start, datetime!(2026-01-01 0:00));
        assert_eq!(m.previous_start, datetime!(2025-12-01 0:00));

        let yr = comparison_starts(CompareMode::Year, now());
        assert_eq!(yr.current_start, datetime!(2026-01-01 0:00));
        assert_eq!(yr.previous_start, datetime!(2025-01-01 0:00));
    }

    #[test]
    fn delta_pct_maneja_cero() {
        assert_eq!(delta_pct(150.0, 100.0), Some(50.0));
        assert_eq!(delta_pct(80.0, 100.0), Some(-20.0));
        assert_eq!(delta_pct(10.0, 0.0), None);
    }
}
