export const REPORT_WINDOW_MS = 15 * 60 * 1000;
const bands = ['quiet', 'moderate', 'lively'];
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function combine(values, sensor, tolerance, now, discrete = false) {
  if (!values.length) return null;
  // A fresh sensor anchors small samples. Without one, a single valid report
  // contributes immediately; additional reports provide an outlier baseline.
  const baseline = values.map(v => v.value);
  if (sensor != null) baseline.push(...Array(4).fill(sensor.value));
  const center = median(baseline);
  const mad = median(baseline.map(value => Math.abs(value - center)));
  const cutoff = Math.max(tolerance, Math.min(3 * mad, 2 * tolerance));
  let inliers = values.filter(v => Math.abs(v.value - center) <= cutoff);
  if (discrete) {
    const groups = [0, 1, 2].map(value => ({ value, votes: values.filter(v => v.value === value).length })).sort((a, b) => b.votes - a.votes);
    inliers = groups[0].votes > groups[1].votes ? values.filter(v => v.value === groups[0].value) : [];
    if (sensor != null) inliers = inliers.filter(v => Math.abs(v.value - sensor.value) <= tolerance);
  }
  if (!inliers.length) return null;
  const weights = inliers.map(v => Math.max(0.01, 1 - (now - Date.parse(v.created_at)) / REPORT_WINDOW_MS));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const community = inliers.reduce((sum, v, i) => sum + v.value * weights[i], 0) / total;
  const weight = Math.min(3, total);
  const value = sensor == null ? community : (sensor.value * 4 + community * weight) / (4 + weight);
  const latest = Math.max(...inliers.map(v => Date.parse(v.created_at)));
  // Do not keep a sensor contribution alive after that sensor becomes stale.
  const expires = Math.min(...inliers.map(v => Date.parse(v.created_at) + REPORT_WINDOW_MS), sensor?.expires ?? Infinity);
  return { value, source: sensor == null ? 'community' : 'sensor + community', report_count: inliers.length,
    measured_at: new Date(latest).toISOString(), expires_at: new Date(expires).toISOString() };
}

export function communityEstimate(room, reports = [], staleAfterSeconds = 60, now = Date.now()) {
  const recent = reports.filter(r => now - Date.parse(r.created_at) < REPORT_WINDOW_MS && Date.parse(r.created_at) <= now);
  // Latest report per reporter per metric. Repeated submissions never add votes.
  const unique = field => [...new Map([...recent].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .filter(r => r[field] != null).map(r => [r.reporter_hash, r])).values()];
  const occupancyReports = [...new Map([...unique('people_count'), ...unique('occupancy_percent')]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map(r => [r.reporter_hash, r])).values()];
  const noiseReports = unique('noise_band');
  const reading = room.latest_reading;
  const sensorTime = Date.parse(reading?.measured_at);
  const sensorFresh = reading && !reading.device_id?.startsWith('demo-') && sensorTime <= now + 60000 && now - sensorTime <= staleAfterSeconds * 1000;
  const expires = sensorTime + staleAfterSeconds * 1000;
  const capacity = room.total_capacity;
  const counts = occupancyReports.filter(r => r.people_count != null || capacity != null)
    .map(r => ({ ...r, value: r.people_count ?? r.occupancy_percent * capacity / 100 }));
  const percent = occupancyReports.filter(r => r.occupancy_percent != null)
    .map(r => ({ ...r, value: r.occupancy_percent / 100 }));
  let occupancy = combine(counts, sensorFresh ? { value: reading.people_count, expires } : null,
    Math.max(3, capacity != null ? capacity * 0.15 : (sensorFresh ? reading.people_count : median(counts.map(r => r.value)) || 0) * 0.25), now);
  if (occupancy) {
    occupancy = { ...occupancy, people_count: Math.max(0, Math.round(occupancy.value)), fraction: capacity ? occupancy.value / capacity : null };
  } else if (capacity == null) {
    const fullness = combine(percent, null, 0.15, now);
    if (fullness) occupancy = { ...fullness, people_count: null, fraction: fullness.value };
  }
  const sensorBand = sensorFresh ? bands.indexOf(reading.noise_level < (reading.noise_unit === 'dBA' ? 45 : 0.25) ? 'quiet' : reading.noise_level < (reading.noise_unit === 'dBA' ? 60 : 0.6) ? 'moderate' : 'lively') : null;
  const noise = combine(noiseReports.map(r => ({ ...r, value: bands.indexOf(r.noise_band) })),
    sensorFresh ? { value: sensorBand, expires } : null, 1, now, true);
  // Public summaries deliberately contain no browser or network identifiers.
  const clean = value => {
    if (!value) return null;
    const { value: unused, ...result } = value;
    return result;
  };
  return {
    occupancy: clean(occupancy),
    noise: noise ? clean({ ...noise, noise_band: bands[Math.max(0, Math.min(2, Math.round(noise.value)))], noise_unit: 'qualitative' }) : null,
    reports: { recent: new Set(recent.map(r => r.reporter_hash)).size,
      occupancy_used: occupancy?.report_count ?? 0, noise_used: noise?.report_count ?? 0 },
  };
}
