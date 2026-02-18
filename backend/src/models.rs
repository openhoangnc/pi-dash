use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuStats {
    pub usage_percent: f32,
    pub frequency_mhz: u64,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub usage_percent: f32,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskStats {
    pub usage_percent: f32,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub total_bytes: u64,
}

/// A pre-grouped temperature reading sent over the wire.
/// The server applies the same grouping logic that was previously in TempCard.tsx.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TempGroup {
    pub label: String,
    /// Maximum temperature of all sensors in this group, rounded to 1 decimal place.
    pub temperature: f32,
}

/// Raw sensor reading used internally during collection only.
#[derive(Debug, Clone)]
pub struct TemperatureSensor {
    pub label: String,
    pub temperature: f32,
    pub sensor_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub timestamp: DateTime<Utc>,
    pub cpu: CpuStats,
    pub memory: MemoryStats,
    pub disk: DiskStats,
    pub temperatures: Vec<TempGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub timestamp: DateTime<Utc>,
    pub cpu_percent: f32,
    pub cpu_freq: u64,
    pub cpu_temp: Option<f32>,
    pub mem_percent: f32,
    pub disk_percent: f32,
    pub temperatures: Vec<TempGroup>,
}

impl From<&SystemStats> for HistoryPoint {
    fn from(s: &SystemStats) -> Self {
        HistoryPoint {
            timestamp: s.timestamp,
            cpu_percent: s.cpu.usage_percent,
            cpu_freq: s.cpu.frequency_mhz,
            cpu_temp: s.cpu.temperature,
            mem_percent: s.memory.usage_percent,
            disk_percent: s.disk.usage_percent,
            temperatures: s.temperatures.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryResponse {
    pub range: String,
    pub points: Vec<HistoryPoint>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub range: Option<String>,
}
