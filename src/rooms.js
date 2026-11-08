export function freshness(room, now, staleAfterSeconds = 60) {
  if (!room.latest_reading) return "waiting";
  if (
    room.stale ||
    now - Date.parse(room.latest_reading.measured_at) > staleAfterSeconds * 1000
  )
    return "delayed";
  return "live";
}

export function locationLabel(location) {
  if (!location) return "";
  const building = [
    location.building,
    location.room_number ? `Room ${location.room_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (building) return building;
  if (location.address) return location.address;
  if (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
  return "";
}

export function noiseBand(reading) {
  if (!reading || !Number.isFinite(reading.noise_level)) return null;
  const [low, high] = reading.noise_unit === "dBA" ? [45, 60] : [0.25, 0.6];
  const level =
    reading.noise_level < low
      ? "quiet"
      : reading.noise_level < high
        ? "moderate"
        : "lively";
  return {
    level,
    label: { quiet: "Quiet", moderate: "Moderate", lively: "Lively" }[level],
  };
}

export function roomState(room, now, staleAfterSeconds) {
  const fresh = freshness(room, now, staleAfterSeconds);
  if (fresh === "waiting")
    return { key: "waiting", label: "Awaiting a reading" };
  if (fresh === "delayed") return { key: "delayed", label: "Reading delayed" };
  const people = room.latest_reading.people_count;
  if (people === 0) return { key: "open", label: "No people detected" };
  if (room.total_capacity == null)
    return { key: "live", label: "Recent reading" };
  if (people >= room.total_capacity)
    return { key: "full", label: "No estimated seats" };
  return { key: "open", label: "Estimated seats available" };
}

export function availableSeats(room, now, staleAfterSeconds) {
  if (
    freshness(room, now, staleAfterSeconds) !== "live" ||
    room.total_capacity == null
  )
    return null;
  return Math.max(0, room.total_capacity - room.latest_reading.people_count);
}

export function formatNoise(reading) {
  if (!reading || !Number.isFinite(reading.noise_level)) return "—";
  return reading.noise_unit === "dBA"
    ? `${reading.noise_level.toFixed(0)} dBA`
    : `${Math.round(reading.noise_level * 100)}% relative sound level`;
}

export function timeAgo(time, now = Date.now()) {
  if (!time) return "Not yet";
  const seconds = Math.max(0, Math.floor((now - Date.parse(time)) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// Fictional examples only. Never used as a fallback for unavailable live data.
export function sampleRooms(now = Date.now()) {
  return [
    [
      "sample-reading-room",
      "The Reading Room",
      "Sample Learning Centre",
      "201",
      16,
      5,
      0.12,
    ],
    [
      "sample-north-window",
      "North Window",
      "Sample Learning Centre",
      "204",
      8,
      2,
      0.2,
    ],
    [
      "sample-commons",
      "The Commons",
      "Example Student Hub",
      "101",
      24,
      18,
      0.52,
    ],
    [
      "sample-quiet-corner",
      "Quiet Corner",
      "Example Student Hub",
      "203",
      6,
      0,
      0.08,
    ],
    [
      "sample-group-studio",
      "Group Studio",
      "Sample Learning Centre",
      "105",
      10,
      10,
      0.76,
    ],
    [
      "sample-sunroom",
      "The Sunroom",
      "Example Student Hub",
      "301",
      12,
      7,
      0.36,
    ],
  ].map(
    ([
      room_id,
      name,
      building,
      room_number,
      total_capacity,
      people_count,
      noise_level,
    ]) => ({
      room_id,
      name,
      total_capacity,
      stale: false,
      source_url: null,
      source_checked_at: null,
      location: {
        building,
        room_number,
        address: null,
        latitude: null,
        longitude: null,
      },
      latest_reading: {
        device_id: "sample",
        measured_at: new Date(now).toISOString(),
        people_count,
        noise_level,
        noise_unit: "relative",
      },
    }),
  );
}

export function sampleHistory(room, now = Date.now()) {
  return Array.from({ length: 16 }, (_, i) => ({
    measured_at: new Date(now - (15 - i) * 300000).toISOString(),
    people_count: Math.max(
      0,
      Math.min(
        room.total_capacity,
        room.latest_reading.people_count + [0, 1, 2, 1, 0, -1, 0, 2][i % 8],
      ),
    ),
  }));
}
