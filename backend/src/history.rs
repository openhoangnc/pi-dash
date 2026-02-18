use std::collections::VecDeque;
use chrono::{DateTime, Utc, TimeDelta};
use parking_lot::RwLock;
use std::sync::Arc;
use crate::models::{HistoryPoint, SystemStats, TempGroup};

const RAW_RETENTION_SECS: i64 = 300; // 5 minutes of raw data
const DAY_BUCKET_SECS: i64 = 60; // 1-minute buckets for day view
const WEEK_BUCKET_SECS: i64 = 900; // 15-minute buckets for week view
const DAY_RETENTION_SECS: i64 = 86400; // 24 hours
const WEEK_RETENTION_SECS: i64 = 604800; // 7 days

#[derive(Debug, Clone)]
struct Bucket {
    timestamp: DateTime<Utc>,
    cpu_percent_sum: f64,
    cpu_freq_sum: u64,
    cpu_temp_sum: f64,
    cpu_temp_count: u32,
    mem_percent_sum: f64,
    disk_percent_sum: f64,
    count: u32,
    temperatures: Vec<TempGroup>,
}

impl Bucket {
    fn new(timestamp: DateTime<Utc>) -> Self {
        Bucket {
            timestamp,
            cpu_percent_sum: 0.0,
            cpu_freq_sum: 0,
            cpu_temp_sum: 0.0,
            cpu_temp_count: 0,
            mem_percent_sum: 0.0,
            disk_percent_sum: 0.0,
            count: 0,
            temperatures: Vec::new(),
        }
    }

    fn add(&mut self, point: &HistoryPoint) {
        self.cpu_percent_sum += point.cpu_percent as f64;
        self.cpu_freq_sum += point.cpu_freq;
        if let Some(temp) = point.cpu_temp {
            self.cpu_temp_sum += temp as f64;
            self.cpu_temp_count += 1;
        }
        self.mem_percent_sum += point.mem_percent as f64;
        self.disk_percent_sum += point.disk_percent as f64;
        self.count += 1;
        // Keep the latest temperature readings
        self.temperatures = point.temperatures.clone();
    }

    fn to_history_point(&self) -> HistoryPoint {
        let n = self.count.max(1) as f64;
        HistoryPoint {
            timestamp: self.timestamp,
            cpu_percent: (self.cpu_percent_sum / n) as f32,
            cpu_freq: self.cpu_freq_sum / self.count.max(1) as u64,
            cpu_temp: if self.cpu_temp_count > 0 {
                Some((self.cpu_temp_sum / self.cpu_temp_count as f64) as f32)
            } else {
                None
            },
            mem_percent: (self.mem_percent_sum / n) as f32,
            disk_percent: (self.disk_percent_sum / n) as f32,
            temperatures: self.temperatures.clone(),
        }
    }
}

pub struct HistoryStoreInner {
    raw: VecDeque<HistoryPoint>,
    day_buckets: VecDeque<Bucket>,
    week_buckets: VecDeque<Bucket>,
}

#[derive(Clone)]
pub struct HistoryStore {
    inner: Arc<RwLock<HistoryStoreInner>>,
}

impl HistoryStore {
    pub fn new() -> Self {
        HistoryStore {
            inner: Arc::new(RwLock::new(HistoryStoreInner {
                raw: VecDeque::new(),
                day_buckets: VecDeque::new(),
                week_buckets: VecDeque::new(),
            })),
        }
    }

    pub fn push(&self, stats: &SystemStats) {
        let point = HistoryPoint::from(stats);
        let mut store = self.inner.write();
        let now = Utc::now();

        // Add raw point
        store.raw.push_back(point.clone());

        // Aggregate into day bucket (1-minute)
        Self::aggregate_into(&mut store.day_buckets, &point, DAY_BUCKET_SECS);

        // Aggregate into week bucket (15-minute)
        Self::aggregate_into(&mut store.week_buckets, &point, WEEK_BUCKET_SECS);

        // Prune old data
        Self::prune(&mut store.raw, now, RAW_RETENTION_SECS);
        Self::prune_buckets(&mut store.day_buckets, now, DAY_RETENTION_SECS);
        Self::prune_buckets(&mut store.week_buckets, now, WEEK_RETENTION_SECS);
    }

    fn aggregate_into(buckets: &mut VecDeque<Bucket>, point: &HistoryPoint, bucket_secs: i64) {
        let bucket_ts = Self::bucket_timestamp(point.timestamp, bucket_secs);

        if let Some(last) = buckets.back_mut() {
            if last.timestamp == bucket_ts {
                last.add(point);
                return;
            }
        }

        let mut bucket = Bucket::new(bucket_ts);
        bucket.add(point);
        buckets.push_back(bucket);
    }

    fn bucket_timestamp(ts: DateTime<Utc>, bucket_secs: i64) -> DateTime<Utc> {
        let epoch_secs = ts.timestamp();
        let bucket_epoch = (epoch_secs / bucket_secs) * bucket_secs;
        DateTime::from_timestamp(bucket_epoch, 0).unwrap_or(ts)
    }

    fn prune(queue: &mut VecDeque<HistoryPoint>, now: DateTime<Utc>, retention_secs: i64) {
        let cutoff = now - TimeDelta::seconds(retention_secs);
        while let Some(front) = queue.front() {
            if front.timestamp < cutoff {
                queue.pop_front();
            } else {
                break;
            }
        }
    }

    fn prune_buckets(buckets: &mut VecDeque<Bucket>, now: DateTime<Utc>, retention_secs: i64) {
        let cutoff = now - TimeDelta::seconds(retention_secs);
        while let Some(front) = buckets.front() {
            if front.timestamp < cutoff {
                buckets.pop_front();
            } else {
                break;
            }
        }
    }

    pub fn get_raw(&self) -> Vec<HistoryPoint> {
        self.inner.read().raw.iter().cloned().collect()
    }

    pub fn get_day(&self) -> Vec<HistoryPoint> {
        self.inner
            .read()
            .day_buckets
            .iter()
            .map(|b| b.to_history_point())
            .collect()
    }

    pub fn get_week(&self) -> Vec<HistoryPoint> {
        self.inner
            .read()
            .week_buckets
            .iter()
            .map(|b| b.to_history_point())
            .collect()
    }
}
