use std::fs;
use std::path::Path;
use std::collections::HashMap;
use sysinfo::{System, Disks, Components};
use crate::models::{CpuStats, MemoryStats, DiskStats, SystemStats, TemperatureSensor, TempGroup};
use chrono::Utc;

pub struct Collector {
    sys: System,
    disks: Disks,
    components: Components,
}

impl Collector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let disks = Disks::new_with_refreshed_list();
        let components = Components::new_with_refreshed_list();
        Collector { sys, disks, components }
    }

    pub fn collect(&mut self) -> SystemStats {
        self.sys.refresh_all();
        self.disks.refresh(true);
        self.components.refresh(true);

        let cpu = self.collect_cpu();
        let memory = self.collect_memory();
        let disk = self.collect_disk();
        let raw_temps = self.collect_temperatures();
        let temperatures = group_temperatures(raw_temps);

        SystemStats {
            timestamp: Utc::now(),
            cpu,
            memory,
            disk,
            temperatures,
        }
    }

    fn collect_cpu(&self) -> CpuStats {
        let cpus = self.sys.cpus();
        let count = cpus.len();
        let usage_percent = if count > 0 {
            cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / count as f32
        } else {
            0.0
        };
        let frequency_mhz = if count > 0 {
            cpus.iter().map(|c| c.frequency()).sum::<u64>() / count as u64
        } else {
            0
        };

        // Try to get CPU temperature from components
        let temperature = self.components.iter()
            .find(|c| {
                let label = c.label().to_lowercase();
                label.contains("cpu") || label.contains("coretemp") || label.contains("k10temp") || label.contains("soc")
            })
            .and_then(|c| c.temperature())
            .map(|t| round1(t));

        CpuStats {
            usage_percent: round1(usage_percent),
            frequency_mhz,
            temperature,
        }
    }

    fn collect_memory(&self) -> MemoryStats {
        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        let free = self.sys.free_memory();

        let usage_percent = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        MemoryStats {
            usage_percent: round1(usage_percent),
            total_bytes: total,
            free_bytes: free,
            used_bytes: used,
        }
    }

    fn collect_disk(&self) -> DiskStats {
        let mut total: u64 = 0;
        let mut available: u64 = 0;

        for disk in self.disks.iter() {
            // Only count real filesystems
            let mount = disk.mount_point().to_string_lossy();
            if mount == "/" || mount.starts_with("/home") || mount.starts_with("/mnt") || mount.starts_with("/media") {
                total += disk.total_space();
                available += disk.available_space();
            }
        }

        // If we didn't find any specific mounts, use all disks
        if total == 0 {
            for disk in self.disks.iter() {
                total += disk.total_space();
                available += disk.available_space();
            }
        }

        let used = total.saturating_sub(available);
        let usage_percent = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        DiskStats {
            usage_percent: round1(usage_percent),
            used_bytes: used,
            available_bytes: available,
            total_bytes: total,
        }
    }

    fn collect_temperatures(&self) -> Vec<TemperatureSensor> {
        let mut sensors = Vec::new();

        // First try scanning /sys/class/hwmon/ directly for full coverage
        sensors.extend(self.scan_hwmon());

        // If hwmon scan returned nothing, fall back to sysinfo components
        if sensors.is_empty() {
            for component in self.components.iter() {
                if let Some(temp) = component.temperature() {
                    sensors.push(TemperatureSensor {
                        label: component.label().to_string(),
                        temperature: temp,
                        sensor_type: "component".to_string(),
                    });
                }
            }
        }

        sensors
    }

    fn scan_hwmon(&self) -> Vec<TemperatureSensor> {
        let mut sensors = Vec::new();
        let hwmon_path = Path::new("/sys/class/hwmon");

        if !hwmon_path.exists() {
            return sensors;
        }

        if let Ok(entries) = fs::read_dir(hwmon_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = fs::read_to_string(path.join("name"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                // Scan for temp*_input files
                if let Ok(files) = fs::read_dir(&path) {
                    for file in files.flatten() {
                        let fname = file.file_name().to_string_lossy().to_string();
                        if fname.starts_with("temp") && fname.ends_with("_input") {
                            let prefix = fname.trim_end_matches("_input");
                            let label_file = path.join(format!("{}_label", prefix));
                            let label = fs::read_to_string(&label_file)
                                .unwrap_or_else(|_| format!("{} {}", name, prefix))
                                .trim()
                                .to_string();

                            if let Ok(val_str) = fs::read_to_string(file.path()) {
                                if let Ok(val) = val_str.trim().parse::<f32>() {
                                    // hwmon reports in millidegrees
                                    let temp = val / 1000.0;
                                    if temp > -40.0 && temp < 150.0 {
                                        sensors.push(TemperatureSensor {
                                            label,
                                            temperature: temp,
                                            sensor_type: name.clone(),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        sensors
    }
}

/// Group raw temperature sensors using the same logic as the old TempCard.tsx:
/// - Sensors whose label contains "npu", "core", "gpu", "soc", or "center" → "SOC" group
/// - All others → grouped by sensor_type
/// Each group emits a single TempGroup with the maximum temperature (rounded to 1 dp).
pub fn group_temperatures(sensors: Vec<TemperatureSensor>) -> Vec<TempGroup> {
    let mut groups: HashMap<String, f32> = HashMap::new();

    for sensor in &sensors {
        let label_lc = sensor.label.to_lowercase();
        let key = if label_lc.contains("npu")
            || label_lc.contains("core")
            || label_lc.contains("gpu")
            || label_lc.contains("soc")
            || label_lc.contains("center")
        {
            "SOC".to_string()
        } else {
            sensor.sensor_type.clone()
        };

        let entry = groups.entry(key).or_insert(f32::NEG_INFINITY);
        if sensor.temperature > *entry {
            *entry = sensor.temperature;
        }
    }

    let mut result: Vec<TempGroup> = groups
        .into_iter()
        .map(|(label, temperature)| TempGroup {
            label,
            temperature: round1(temperature),
        })
        .collect();

    // Stable order: SOC first, then alphabetical
    result.sort_by(|a, b| {
        if a.label == "SOC" {
            std::cmp::Ordering::Less
        } else if b.label == "SOC" {
            std::cmp::Ordering::Greater
        } else {
            a.label.cmp(&b.label)
        }
    });

    result
}

/// Round a float to 1 decimal place.
#[inline]
fn round1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}
