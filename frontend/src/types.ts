/// Pre-grouped temperature reading (server-side grouping applied).
export interface TempGroup {
  label: string;
  temperature: number;
}

export interface CpuStats {
  usage_percent: number;
  frequency_mhz: number;
  temperature: number | null;
}

export interface MemoryStats {
  usage_percent: number;
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

export interface NetworkStats {
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
}

export interface DiskIoStats {
  read_bytes_per_sec: number;
  write_bytes_per_sec: number;
}

export interface SystemStats {
  timestamp: string;
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats;
  network: NetworkStats;
  disk_io: DiskIoStats;
  temperatures: TempGroup[];
}

export interface HistoryPoint {
  timestamp: string;
  cpu_percent: number;
  cpu_freq: number;
  cpu_temp: number | null;
  mem_percent: number;
  disk_percent: number;
  network_rx_bytes_sec: number;
  network_tx_bytes_sec: number;
  disk_read_bytes_sec: number;
  disk_write_bytes_sec: number;
  temperatures: TempGroup[];
}

export interface HistoryResponse {
  range: string;
  points: HistoryPoint[];
}
