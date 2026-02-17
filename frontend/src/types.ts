export interface CpuStats {
  usage_percent: number;
  frequency_mhz: number;
  count: number;
  temperature: number | null;
}

export interface MemoryStats {
  usage_percent: number;
  available_percent: number;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
}

export interface DiskStats {
  usage_percent: number;
  used_bytes: number;
  available_bytes: number;
  total_bytes: number;
}

export interface TemperatureSensor {
  label: string;
  temperature: number;
  sensor_type: string;
}

export interface SystemStats {
  timestamp: string;
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats;
  temperatures: TemperatureSensor[];
}

export interface HistoryPoint {
  timestamp: string;
  cpu_percent: number;
  cpu_freq: number;
  cpu_temp: number | null;
  mem_percent: number;
  disk_percent: number;
  temperatures: TemperatureSensor[];
}

export interface HistoryResponse {
  range: string;
  points: HistoryPoint[];
}
