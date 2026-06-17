//! Dispositivos oficiales (TPV) (#154, Fase 4): alta con token de emparejamiento
//! (hash en BD), listado, emparejado (autoriza) y revocado. Estado consultable
//! desde el propio TPV con el token.

pub mod input;
pub mod model;
pub mod service;

pub use input::{CreateDevice, PairDevice};
pub use model::{CreatedDevice, DeviceListItem, DeviceStatus, PublicDevice};
