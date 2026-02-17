use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuStats {
    pub usage_percent: f32,
    pub frequency_mhz: u64,
    pub count: usize,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub usage_percent: f32,
    pub available_percent: f32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub temperatures: Vec<TemperatureSensor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub timestamp: DateTime<Utc>,
    pub cpu_percent: f32,
    pub cpu_freq: u64,
    pub cpu_temp: Option<f32>,
    pub mem_percent: f32,
    pub disk_percent: f32,
    pub temperatures: Vec<TemperatureSensor>,
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

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub range: Option<String>,
}
