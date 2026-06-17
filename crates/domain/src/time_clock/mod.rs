//! Control horario (#153, Fase 3): fichajes (entrada/salida/pausa) con máquina de
//! estados y cómputo de horas, dispositivo oficial obligatorio, flag `time_clock`
//! e historial agregado por jornada.

pub mod compute;
pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateEntry, HistoryQuery};
pub use model::{EntryLog, JornadaRow, TimeClockEntry, TimeClockType, TodaySummary};
