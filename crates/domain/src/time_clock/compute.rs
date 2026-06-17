//! Lógica pura del control horario (#153) — port de `time-clock.compute.ts`.
//! Máquina de estados de fichajes + reparto de tiempo trabajado/pausa. Sin BD.
//!
//! Límites de día: en UTC (paridad con un backend desplegado en UTC; NestJS usa
//! la TZ del servidor — misma zona difusa). El cliente cuenta en vivo el segmento
//! en curso desde `running_since`.

use simpletpv_shared::AppError;
use time::{PrimitiveDateTime, Time};

use super::model::TimeClockType;

/// Estado de la jornada derivado de la secuencia de fichajes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeClockStatus {
    Out,
    In,
    Break,
}

impl TimeClockStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            TimeClockStatus::Out => "OUT",
            TimeClockStatus::In => "IN",
            TimeClockStatus::Break => "BREAK",
        }
    }
}

/// Transición válida de la máquina de estados, o `None` si es inválida.
fn transition(status: TimeClockStatus, t: TimeClockType) -> Option<TimeClockStatus> {
    use TimeClockStatus::*;
    use TimeClockType::*;
    match t {
        ClockIn => (status == Out).then_some(In),
        BreakStart => (status == In).then_some(Break),
        BreakEnd => (status == Break).then_some(In),
        ClockOut => matches!(status, In | Break).then_some(Out),
    }
}

fn invalid_message(status: TimeClockStatus, t: TimeClockType) -> &'static str {
    use TimeClockStatus::*;
    use TimeClockType::*;
    match t {
        ClockIn => "Ya tienes un fichaje de entrada activo",
        ClockOut => "No tienes ningún fichaje activo",
        BreakStart if status == Break => "Ya estás en una pausa",
        BreakStart => "Debes fichar entrada antes de iniciar una pausa",
        BreakEnd => "No tienes ninguna pausa activa",
    }
}

/// Valida la transición; `Conflict` (409) con mensaje claro si es inválida.
pub fn next_state_or_throw(
    status: TimeClockStatus,
    t: TimeClockType,
) -> Result<TimeClockStatus, AppError> {
    transition(status, t).ok_or_else(|| {
        // El mensaje queda documentado; AppError::Conflict no lo transporta hoy.
        let _ = invalid_message(status, t);
        AppError::Conflict
    })
}

/// Estado actual a partir del tipo del ÚLTIMO fichaje.
pub fn status_from_last_type(last: Option<TimeClockType>) -> TimeClockStatus {
    match last {
        Some(TimeClockType::ClockIn) | Some(TimeClockType::BreakEnd) => TimeClockStatus::In,
        Some(TimeClockType::BreakStart) => TimeClockStatus::Break,
        _ => TimeClockStatus::Out, // ClockOut o sin fichajes
    }
}

/// Estado al final de una secuencia completa (orden ascendente).
pub fn derive_status(entries: &[TimeClockType]) -> TimeClockStatus {
    let mut status = TimeClockStatus::Out;
    for &t in entries {
        if let Some(next) = transition(status, t) {
            status = next;
        }
    }
    status
}

/// Totales de la jornada. `worked_ms` excluye el segmento IN en curso (se cuenta
/// en vivo desde `running_since`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkedTotals {
    pub worked_ms: i64,
    pub break_ms: i64,
    pub running_since: Option<PrimitiveDateTime>,
}

fn ms_between(a: PrimitiveDateTime, b: PrimitiveDateTime) -> i64 {
    (a - b).whole_milliseconds() as i64
}

/// Reparte la secuencia en tiempo trabajado y de pausa (port de `computeWorked`).
pub fn compute_worked(
    entries: &[(TimeClockType, PrimitiveDateTime)],
    now: PrimitiveDateTime,
) -> WorkedTotals {
    use TimeClockType::*;
    let mut status = TimeClockStatus::Out;
    let mut seg_start: Option<PrimitiveDateTime> = None;
    let mut break_start: Option<PrimitiveDateTime> = None;
    let mut worked_ms: i64 = 0;
    let mut break_ms: i64 = 0;

    for &(t, at) in entries {
        let Some(next) = transition(status, t) else {
            continue;
        };
        match t {
            ClockIn => seg_start = Some(at),
            BreakStart => {
                if let Some(s) = seg_start {
                    worked_ms += ms_between(at, s);
                }
                seg_start = None;
                break_start = Some(at);
            }
            BreakEnd => {
                if let Some(b) = break_start {
                    break_ms += ms_between(at, b);
                }
                break_start = None;
                seg_start = Some(at);
            }
            ClockOut => {
                if let Some(s) = seg_start {
                    worked_ms += ms_between(at, s);
                }
                if let Some(b) = break_start {
                    break_ms += ms_between(at, b);
                }
                seg_start = None;
                break_start = None;
            }
        }
        status = next;
    }

    let mut running_since = None;
    match status {
        TimeClockStatus::In => running_since = seg_start,
        TimeClockStatus::Break => {
            if let Some(b) = break_start {
                break_ms += ms_between(now, b);
            }
        }
        TimeClockStatus::Out => {}
    }

    WorkedTotals {
        worked_ms,
        break_ms,
        running_since,
    }
}

/// Total trabajado incluyendo el segmento en curso (para reportes).
pub fn total_worked_ms(totals: &WorkedTotals, now: PrimitiveDateTime) -> i64 {
    match totals.running_since {
        Some(since) => totals.worked_ms + ms_between(now, since),
        None => totals.worked_ms,
    }
}

/// Inicio del día (00:00:00 UTC) de una fecha.
pub fn start_of_day(dt: PrimitiveDateTime) -> PrimitiveDateTime {
    PrimitiveDateTime::new(dt.date(), Time::MIDNIGHT)
}

/// Fin del día (23:59:59.999 UTC) de una fecha.
pub fn end_of_day(dt: PrimitiveDateTime) -> PrimitiveDateTime {
    PrimitiveDateTime::new(dt.date(), Time::from_hms_milli(23, 59, 59, 999).unwrap())
}

/// Clave de día `YYYY-MM-DD` (UTC) para agrupar jornadas.
pub fn day_key(dt: PrimitiveDateTime) -> String {
    let d = dt.date();
    format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day())
}

/// Resta `days` días a una fecha (para el rango por defecto del historial).
pub fn minus_days(dt: PrimitiveDateTime, days: i64) -> PrimitiveDateTime {
    let date = dt.date().saturating_sub(time::Duration::days(days));
    PrimitiveDateTime::new(date, dt.time())
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn maquina_de_estados_transiciones_validas() {
        assert_eq!(
            next_state_or_throw(TimeClockStatus::Out, TimeClockType::ClockIn).unwrap(),
            TimeClockStatus::In
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::In, TimeClockType::BreakStart).unwrap(),
            TimeClockStatus::Break
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::Break, TimeClockType::BreakEnd).unwrap(),
            TimeClockStatus::In
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::In, TimeClockType::ClockOut).unwrap(),
            TimeClockStatus::Out
        );
    }

    #[test]
    fn maquina_de_estados_rechaza_invalidas() {
        // Doble entrada, salida sin entrar, pausa sin entrar, fin de pausa sin pausa.
        assert_eq!(
            next_state_or_throw(TimeClockStatus::In, TimeClockType::ClockIn),
            Err(AppError::Conflict)
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::Out, TimeClockType::ClockOut),
            Err(AppError::Conflict)
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::Out, TimeClockType::BreakStart),
            Err(AppError::Conflict)
        );
        assert_eq!(
            next_state_or_throw(TimeClockStatus::In, TimeClockType::BreakEnd),
            Err(AppError::Conflict)
        );
    }

    #[test]
    fn status_desde_ultimo_y_secuencia() {
        assert_eq!(status_from_last_type(None), TimeClockStatus::Out);
        assert_eq!(
            status_from_last_type(Some(TimeClockType::BreakStart)),
            TimeClockStatus::Break
        );
        let seq = [
            TimeClockType::ClockIn,
            TimeClockType::BreakStart,
            TimeClockType::BreakEnd,
        ];
        assert_eq!(derive_status(&seq), TimeClockStatus::In);
    }

    #[test]
    fn compute_worked_jornada_con_pausa() {
        // 09:00 in, 11:00 break, 11:30 back, 13:00 out → trabajado 3.5h, pausa 0.5h.
        let entries = [
            (TimeClockType::ClockIn, datetime!(2026-06-02 09:00:00)),
            (TimeClockType::BreakStart, datetime!(2026-06-02 11:00:00)),
            (TimeClockType::BreakEnd, datetime!(2026-06-02 11:30:00)),
            (TimeClockType::ClockOut, datetime!(2026-06-02 13:00:00)),
        ];
        let t = compute_worked(&entries, datetime!(2026-06-02 14:00:00));
        assert_eq!(t.worked_ms, (3 * 3600 + 1800) * 1000); // 3.5h
        assert_eq!(t.break_ms, 1800 * 1000); // 0.5h
        assert!(t.running_since.is_none());
    }

    #[test]
    fn compute_worked_segmento_en_curso_no_se_suma() {
        // 09:00 in, sigue dentro → worked 0, running_since = 09:00.
        let entries = [(TimeClockType::ClockIn, datetime!(2026-06-02 09:00:00))];
        let t = compute_worked(&entries, datetime!(2026-06-02 12:00:00));
        assert_eq!(t.worked_ms, 0);
        assert_eq!(t.running_since, Some(datetime!(2026-06-02 09:00:00)));
        // total_worked_ms sí incluye el segmento en curso (3h).
        assert_eq!(
            total_worked_ms(&t, datetime!(2026-06-02 12:00:00)),
            3 * 3600 * 1000
        );
    }

    #[test]
    fn day_helpers() {
        let dt = datetime!(2026-06-02 14:30:00);
        assert_eq!(start_of_day(dt), datetime!(2026-06-02 00:00:00));
        assert_eq!(day_key(dt), "2026-06-02");
        assert_eq!(minus_days(dt, 7).date(), datetime!(2026-05-26 0:00).date());
    }
}
