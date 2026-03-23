use std::fs;
use std::path::Path;
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{System, Disks, Components};
use crate::models::{CpuStats, MemoryStats, DiskStats, SystemStats, TemperatureSensor, TempGroup, NetworkStats, DiskIoStats};
use chrono::Utc;

struct ProcStats {
    timestamp: Instant,
    net_rx: u64,
    net_tx: u64,
    disk_read: u64,
    disk_write: u64,
}

pub struct Collector {
    sys: System,
    disks: Disks,
    components: Components,
    last_proc_stats: Option<ProcStats>,
    last_stats: Option<SystemStats>,
    last_collection_time: Option<Instant>,
}

impl Collector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let disks = Disks::new_with_refreshed_list();
        let components = Components::new_with_refreshed_list();
        Collector { 
            sys, 
            disks, 
            components, 
            last_proc_stats: None,
            last_stats: None,
            last_collection_time: None,
        }
    }

    pub fn collect(&mut self) -> SystemStats {
        let now = Instant::now();
        
        // If we collected very recently (e.g. within 500ms), return cached stats.
        // This prevents on-demand API calls from messing up the deltas for the 
        // background collector loop (stolen delta problem).
        if let (Some(last_s), Some(last_t)) = (&self.last_stats, self.last_collection_time) {
            if now.duration_since(last_t).as_millis() < 500 {
                return last_s.clone();
            }
        }
        self.sys.refresh_all();
        self.disks.refresh(true);
        self.components.refresh(true);

        let cpu = self.collect_cpu();
        let memory = self.collect_memory();
        let disk = self.collect_disk();
        let raw_temps = self.collect_temperatures();
        let temperatures = group_temperatures(raw_temps);

        let (network, disk_io) = self.collect_proc_stats();

        let stats = SystemStats {
            timestamp: Utc::now(),
            cpu,
            memory,
            disk,
            network,
            disk_io,
            temperatures,
        };

        self.last_stats = Some(stats.clone());
        self.last_collection_time = Some(now);
        stats
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

    fn collect_proc_stats(&mut self) -> (NetworkStats, DiskIoStats) {
        let mut current_rx: u64 = 0;
        let mut current_tx: u64 = 0;
        
        if let Ok(content) = fs::read_to_string("/proc/net/dev") {
            for line in content.lines().skip(2) {
                if let Some((iface, stats)) = line.split_once(':') {
                    let iface = iface.trim();
                    // Ignore loopback and virtual/docker interfaces to prevent double counting
                    if iface == "lo" 
                        || iface.starts_with("veth") 
                        || iface.starts_with("docker") 
                        || iface.starts_with("br-")
                        || iface.starts_with("flannel") 
                        || iface.starts_with("cni")
                        || iface.starts_with("wg")
                        || iface.starts_with("tun")
                        || iface.starts_with("tap")
                        || iface.starts_with("tailscale")
                        || iface.starts_with("utun")
                    {
                        continue;
                    }
                    let parts: Vec<&str> = stats.split_whitespace().collect();
                    if parts.len() >= 16 {
                        // rx_bytes is at index 0, tx_bytes is at index 8 of the stats part
                        let rx: u64 = parts[0].parse().unwrap_or(0);
                        let tx: u64 = parts[8].parse().unwrap_or(0);
                        current_rx = current_rx.saturating_add(rx);
                        current_tx = current_tx.saturating_add(tx);
                    }
                }
            }
        }

        let mut current_disk_read: u64 = 0;
        let mut current_disk_write: u64 = 0;

        if let Ok(content) = fs::read_to_string("/proc/diskstats") {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 14 {
                    let dev_name = parts[2];
                    
                    // Filter to only include whole disks, not partitions, to avoid double counting.
                    // Standard disks: sda, sdb (ignore sda1, sdb2)
                    // NVMe: nvme0n1 (ignore nvme0n1p1)
                    // SD/MMC: mmcblk0 (ignore mmcblk0p1)
                    if dev_name.starts_with("loop") || dev_name.starts_with("ram") || dev_name.starts_with("zram") {
                        continue;
                    }
                    
                    let is_whole_disk = if dev_name.starts_with("sd") || dev_name.starts_with("hd") || dev_name.starts_with("vd") {
                        // sdX, hdX, vdX - whole disk if it doesn't end with a digit
                        !dev_name.chars().last().map_or(false, |c| c.is_ascii_digit())
                    } else if dev_name.starts_with("nvme") || dev_name.starts_with("mmcblk") {
                        // nvmeXn1, mmcblk0 - whole disk if it doesn't contain 'p' followed by a digit
                        !dev_name.contains('p')
                    } else {
                        // For other devices, if we can't be sure, we count them if they look like primary devices
                        // This is a fallback.
                        true
                    };

                    if is_whole_disk {
                        let sectors_read: u64 = parts[5].parse().unwrap_or(0);
                        let sectors_written: u64 = parts[9].parse().unwrap_or(0);
                        current_disk_read += sectors_read * 512;
                        current_disk_write += sectors_written * 512;
                    }
                }
            }
        }

        let now = Instant::now();
        let mut rx_bps = 0;
        let mut tx_bps = 0;
        let mut read_bps = 0;
        let mut write_bps = 0;

        if let Some(last) = &self.last_proc_stats {
            let elapsed = now.duration_since(last.timestamp).as_secs_f64();
            if elapsed > 0.0 {
                if current_rx > last.net_rx {
                    rx_bps = ((current_rx - last.net_rx) as f64 / elapsed) as u64;
                }
                if current_tx > last.net_tx {
                    tx_bps = ((current_tx - last.net_tx) as f64 / elapsed) as u64;
                }
                if current_disk_read > last.disk_read {
                    read_bps = ((current_disk_read - last.disk_read) as f64 / elapsed) as u64;
                }
                if current_disk_write > last.disk_write {
                    write_bps = ((current_disk_write - last.disk_write) as f64 / elapsed) as u64;
                }
            }
        }

        self.last_proc_stats = Some(ProcStats {
            timestamp: now,
            net_rx: current_rx,
            net_tx: current_tx,
            disk_read: current_disk_read,
            disk_write: current_disk_write,
        });

        (
            NetworkStats { rx_bytes_per_sec: rx_bps, tx_bytes_per_sec: tx_bps },
            DiskIoStats { read_bytes_per_sec: read_bps, write_bytes_per_sec: write_bps }
        )
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
