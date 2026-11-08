import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  ChevronDown,
  DoorOpen,
  Heart,
  Info,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import {
  availableSeats,
  formatNoise,
  freshness,
  noiseBand,
  roomState,
  sampleHistory,
  sampleRooms,
  timeAgo,
  locationLabel,
  occupancyReading,
  noiseReading,
  displayedNoiseReading,
  hasStaticDemo,
  hasDisplayedOccupancy,
  hasRecentReading,
} from "./rooms.js";
import { useRooms, useSavedRooms } from "./useRooms.js";
import { fetchJson } from "./api.js";
import directoryRooms from "../data/rooms.json";
import roomPhotos from "../data/room-images.json";
import { mergeDirectory } from "./roomSources.js";
import { matchesRoomSearch } from "./roomSearch.js";
import ReportForm from "./ReportForm.jsx";

function EstimateSource({ room, now }) {
  const values = [
    ["Occupancy", room.estimate?.occupancy],
    ["Noise", room.estimate?.noise],
  ].filter(([, value]) => value && now < Date.parse(value.expires_at));
  const recent = room.estimate?.reports?.recent ?? 0;
  if (!values.length && !recent) return null;
  return (
    <p className="estimate-source">
      {values.length
        ? values.map(([label, value]) => `${label}: ${value.source} · ${value.report_count} contributing ${value.report_count === 1 ? "report" : "reports"}`).join(" / ")
        : `${recent} recent community ${recent === 1 ? "report" : "reports"} · no current contribution after filtering`}
    </p>
  );
}

const filters = [
  { id: "all", label: "All" },
  { id: "available", label: "Seats available" },
  { id: "quiet", label: "Quiet" },
  { id: "saved", label: "Saved" },
];

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <MapPin size={22} strokeWidth={1.7} />
      </span>
      SensoryAtlas<span className="brand-period">.</span>
    </span>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onFocus={(event) => {
        if (event.target === event.currentTarget)
          event.currentTarget.querySelector("button")?.focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}

function HowItWorks({ onClose }) {
  return (
    <Modal title="How SensoryAtlas works" onClose={onClose}>
      <span className="eyebrow">A little less guesswork</span>
      <h2>
        A good spot changes
        <br />
        your whole study session.
      </h2>
      <p className="modal-intro">
        SensoryAtlas brings crowding, sound readings, and community observations
        together, so you can choose a study space that suits you.
      </p>
      <div className="how-steps">
        <div>
          <span>01</span>
          <div>
            <h3>Find your kind of space</h3>
            <p>Search by room or building, or save a favourite for later.</p>
          </div>
        </div>
        <div>
          <span>02</span>
          <div>
            <h3>Check the latest reading</h3>
            <p>
              See the people count, available seats when capacity is known, and
              the sound band at the last measurement. Favourites are saved only
              in this browser.
            </p>
          </div>
        </div>
        <div>
          <span>03</span>
          <div>
            <h3>Settle in and focus</h3>
            <p>
              The dashboard checks for updates roughly every 10 seconds. Each
              measurement has its own timestamp; a successful check does not
              mean a new measurement arrived. Delayed readings are marked.
            </p>
          </div>
        </div>
      </div>
      <div className="quiet-note">
        <Info size={18} />
        <p>
          Noise labels are approximate bands. Relative levels depend on the
          sensor; dBA is shown only when supplied as that unit. Only counts and
          noise readings appear here.
        </p>
      </div>
    </Modal>
  );
}

function RoomCard({
  room,
  now,
  staleAfterSeconds,
  saved,
  onSave,
  onOpen,
  demo,
}) {
  const state = roomState(room, now, staleAfterSeconds);
  const live = hasDisplayedOccupancy(room, now, staleAfterSeconds);
  const reading = room.latest_reading;
  const occupancy = occupancyReading(room, now);
  const sound = displayedNoiseReading(room, now, staleAfterSeconds);
  const outdatedSound = sound && !noiseReading(room, now, staleAfterSeconds);
  const current = hasRecentReading(room, now, staleAfterSeconds);
  const estimate = [room.estimate?.occupancy, room.estimate?.noise]
    .find((value) => value && now < Date.parse(value.expires_at));
  const timestamp = estimate?.measured_at ?? reading?.measured_at;
  const count =
    Number.isFinite(occupancy?.people_count)
      ? occupancy.people_count
      : null;
  const fraction = live ? occupancy?.fraction : null;
  const seats = availableSeats(room, now, staleAfterSeconds);
  const band = noiseBand(sound);
  const photo = roomPhotos.images[room.catalog_id ?? room.room_id];
  return (
    <article className="room-card">
      <div className="room-card-body">
        <div className="card-heading">
          <div>
            <h3>{room.name}</h3>
            <p className="room-location">
              {locationLabel(room.location) || "Location not listed yet"}
            </p>
          </div>
          <button
            className={`save-button ${saved ? "is-saved" : ""}`}
            onClick={() => onSave(room.room_id)}
            aria-label={`${saved ? "Unsave" : "Save"} ${room.name}`}
            aria-pressed={saved}
          >
            <Heart size={19} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
        {photo && (
          <div className="room-photo">
            <img
              src={photo.path}
              alt={`${room.name} study area, from UBC Learning Spaces`}
              loading="lazy"
              width="768"
              height="512"
            />
          </div>
        )}
        {demo && (
          <p className="sample-label">Demo mode · fictional sample data</p>
        )}
        {!demo && hasStaticDemo(room) && (
          <p className="sample-label">Fictional sensor history · static demo data</p>
        )}
        <div className="card-metrics">
          <div className={`card-metric noise-${band?.level ?? "unknown"}`}>
            <AudioLines size={20} aria-hidden="true" />
            <span>{outdatedSound ? "Last noise level · outdated" : "Noise level"}</span>
            <strong>{band?.label ?? "Noise unavailable"}</strong>
            {sound?.noise_unit === "dBA" && band && (
              <small>{formatNoise(sound)}</small>
            )}
          </div>
          <div className={`card-metric ${seats === 0 ? "metric-full" : ""}`}>
            <Users size={20} aria-hidden="true" />
            <span>{!live && count != null ? "Last occupancy · outdated" : seats != null ? "Estimated seats" : "Occupancy"}</span>
            <strong>
              {seats != null
                ? `About ${seats} ${seats === 1 ? "seat" : "seats"} free`
                : count != null
                  ? `About ${count} people`
                  : fraction != null
                    ? `~${Math.round(fraction * 100)}% full`
                    : "Occupancy unavailable"}
            </strong>
            <small>
              {room.total_capacity != null
                ? `Capacity: ${room.total_capacity} seats`
                : "Capacity unknown"}
            </small>
          </div>
        </div>
        <EstimateSource room={room} now={now} />
        <div className="reading-age">
          <span
            className={`status-pill ${current ? "status-live" : "status-delayed"}`}
          >
            <span />
            {hasStaticDemo(room) && freshness(room, now, staleAfterSeconds) === "demo"
              ? "Static demo data"
              : estimate
                ? `Community ${estimate === room.estimate.occupancy ? "occupancy" : "noise"} estimate`
                : current ? "Recent reading" : reading ? state.label : "No live readings"}
          </span>
          <span>
            {timestamp
              ? `${estimate ? "Reported" : current ? "Measured" : "Last measured"} ${timeAgo(timestamp, now).toLowerCase()}`
              : "Location details available"}
          </span>
        </div>
      </div>
      <div className="room-card-footer">
        <span>
          {count != null
            ? `About ${count} people ${!live ? "at last measurement" : occupancy?.source ? "estimated" : "measured"}`
            : "Current occupancy unknown"}
        </span>
        <button onClick={() => onOpen(room)} aria-label={`View ${room.name}`}>
          View space <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}

function ActivityChart({ readings }) {
  readings = readings
    .filter(
      (reading) =>
        Number.isFinite(reading.people_count) &&
        Number.isFinite(Date.parse(reading.measured_at)),
    )
    .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  if (!readings.length)
    return (
      <div className="activity-empty">
        <AudioLines size={25} strokeWidth={1.4} />
        <strong>No occupancy history yet.</strong>
        <p>Recent occupancy will appear after readings arrive.</p>
      </div>
    );
  const max = Math.max(4, ...readings.map((r) => r.people_count));
  const left = 28,
    right = 572,
    top = 14,
    bottom = 132;
  const times = readings.map((r) => Date.parse(r.measured_at));
  const start = Math.min(...times),
    end = Math.max(...times);
  const points = readings.map((r, i) => [
    end === start
      ? (left + right) / 2
      : left + ((times[i] - start) / (end - start)) * (right - left),
    bottom - (r.people_count / max) * (bottom - top),
  ]);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const format = (value) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <div className="activity-chart">
      <svg
        viewBox="0 0 600 160"
        role="img"
        aria-label={`People count over time, ${readings.length} readings`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              y1={bottom - f * (bottom - top)}
              x2={right}
              y2={bottom - f * (bottom - top)}
              stroke="#e7ebe5"
              strokeDasharray="3 5"
            />
            <text
              x="9"
              y={bottom - f * (bottom - top) + 4}
              fill="#7b857e"
              fontSize="10"
            >
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <>
            <path
              d={`${path} L${points.at(-1)[0]},${bottom} L${points[0][0]},${bottom} Z`}
              fill="#dce8df"
              opacity=".6"
            />
            <path
              d={path}
              fill="none"
              stroke="#326451"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </>
        )}
        {points.map(([x, y], i) => (
          <circle
            key={`${readings[i].measured_at}-${i}`}
            cx={x}
            cy={y}
            r={points.length > 30 ? 2 : 3.5}
            fill="#326451"
          >
            <title>
              {readings[i].people_count} people at{" "}
              {format(readings[i].measured_at)}
            </title>
          </circle>
        ))}
        <text x={left} y="155" fill="#7b857e" fontSize="10">
          {format(start)}
        </text>
        <text x={right} y="155" textAnchor="end" fill="#7b857e" fontSize="10">
          {format(end)}
        </text>
      </svg>
    </div>
  );
}

function RoomDetails({
  room,
  demo,
  now,
  staleAfterSeconds,
  saved,
  onSave,
  onClose,
  onReported,
}) {
  const [history, setHistory] = useState({ status: "loading", readings: [] });
  const [attempt, setAttempt] = useState(0);
  const state = !hasDisplayedOccupancy(room, now, staleAfterSeconds) &&
    hasRecentReading(room, now, staleAfterSeconds)
    ? { key: "live", label: "Community noise estimate" }
    : roomState(room, now, staleAfterSeconds);
  const live = hasDisplayedOccupancy(room, now, staleAfterSeconds);
  const occupancy = occupancyReading(room, now);
  const sound = displayedNoiseReading(room, now, staleAfterSeconds);
  const outdatedSound = sound && !noiseReading(room, now, staleAfterSeconds);
  useEffect(() => {
    if (demo) {
      setHistory({ status: "ok", readings: sampleHistory(room, now) });
      return;
    }
    const controller = new AbortController();
    setHistory({ status: "loading", readings: [] });
    fetchJson(
      `/api/readings?room_id=${encodeURIComponent(room.room_id)}&limit=100`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!Array.isArray(data.readings)) throw new Error();
        setHistory({ status: "ok", readings: data.readings });
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setHistory({ status: "error", readings: [] });
      });
    return () => controller.abort();
    // A detail request represents one snapshot; the room's latest reading still updates live.
  }, [room.room_id, demo, attempt]);
  const location = locationLabel(room.location);
  return (
    <Modal title={room.name} onClose={onClose} wide>
      <span className="eyebrow">
        {demo ? "Demo mode · fictional sample data" : hasStaticDemo(room) ? "Fictional sensor history · static demo data" : "Study space details"}
      </span>
      <h2>{room.name}</h2>
      <p className="detail-location">
        <MapPin size={16} />
        {location || "Location not listed yet"}
      </p>
      {directionsUrl(room) && (
        <a
          className="primary-button directions-link"
          href={directionsUrl(room)}
          target="_blank"
          rel="noreferrer"
        >
          Directions <ArrowUpRight size={16} />
        </a>
      )}
      <div className="detail-status">
        <span className={`status-pill status-${state.key}`}>
          <span />
          {state.label}
        </span>
        <button
          className={`text-save ${saved ? "is-saved" : ""}`}
          onClick={() => onSave(room.room_id)}
          aria-pressed={saved}
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved space" : "Save this space"}
        </button>
      </div>
      <div className="detail-metrics">
        <div>
          <Users size={19} />
          <span>{!live && Number.isFinite(occupancy?.people_count) ? "Last people count · outdated" : "Estimated people"}</span>
          <strong>
            {Number.isFinite(occupancy?.people_count)
              ? occupancy.people_count
              : live && occupancy?.fraction != null
                ? `~${Math.round(occupancy.fraction * 100)}% full`
                : "—"}
            <small> / {room.total_capacity ?? "—"}</small>
          </strong>
        </div>
        <div>
          <AudioLines size={20} />
          <span>{outdatedSound ? "Last sound band · outdated" : "Sound band · approximate"}</span>
          <strong>
            {sound
              ? (noiseBand(sound)?.label ?? "Noise unavailable")
              : "Noise unavailable"}
            <small>
              {sound ? formatNoise(sound) : "No current reading"}
            </small>
          </strong>
        </div>
        <div>
          <DoorOpen size={20} />
          <span>Estimated available seats</span>
          <strong>
            {availableSeats(room, now, staleAfterSeconds) ?? "—"}
            <small>
              {room.total_capacity == null
                ? "Capacity unknown"
                : `Capacity: ${room.total_capacity} seats`}
            </small>
          </strong>
        </div>
      </div>
      <EstimateSource room={room} now={now} />
      {!demo && <ReportForm key={room.room_id} room={room} onReported={onReported} />}
      <p className="measurement-time">
        {room.latest_reading
          ? `Last measured ${new Date(room.latest_reading.measured_at).toLocaleString()} (${timeAgo(room.latest_reading.measured_at, now).toLowerCase()})`
          : "Awaiting the first measurement"}
      </p>
      {room.location?.address && (
        <p className="address-line">
          <MapPin size={15} />
          {room.location.address}
        </p>
      )}
      <div className="activity-heading">
        <h3>Recent occupancy</h3>
        <span>
          {demo
            ? "Up to 100 recent readings · fictional"
            : "Up to 100 recent readings · sensor history"}
        </span>
      </div>
      {history.status === "loading" ? (
        <div className="activity-empty">
          <RefreshCw size={22} className="spin" />
          <p>Loading recent occupancy…</p>
        </div>
      ) : history.status === "error" ? (
        <div className="activity-empty">
          <p>Occupancy history couldn’t be loaded.</p>
          <button
            className="text-button"
            onClick={() => setAttempt((x) => x + 1)}
          >
            Try again <RefreshCw size={14} />
          </button>
        </div>
      ) : (
        <ActivityChart readings={history.readings} />
      )}
      <div className="detail-footnote">
        <Info size={16} />
        <p>
          {room.latest_reading
            ? `Last measured ${new Date(room.latest_reading.measured_at).toLocaleString()}. `
            : "No sensor readings yet. "}
          Noise labels are approximate; readings retain their original units.
        </p>
      </div>
      {room.source_url && (
        <a
          className="source-link"
          href={room.source_url}
          target="_blank"
          rel="noreferrer"
        >
          UBC room page <ArrowUpRight size={14} />
        </a>
      )}
    </Modal>
  );
}

function directionsUrl(room) {
  const location = room.location;
  if (!location) return null;
  const destination =
    Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
      ? `${location.latitude},${location.longitude}`
      : location.address;
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
}

export default function App() {
  const live = useRooms();
  const liveSaved = useSavedRooms();
  const demoSaved = useSavedRooms("sensoryatlas.demo.saved");
  const [now, setNow] = useState(Date.now());
  const [demo, setDemo] = useState(
    () => new URLSearchParams(window.location.search).get("demo") === "1",
  );
  const { saved, toggle } = demo ? demoSaved : liveSaved;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [building, setBuilding] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [limit, setLimit] = useState(12);
  const [selected, setSelected] = useState(null);
  const [how, setHow] = useState(false);
  const spacesRef = useRef(null);
  const examples = useMemo(() => sampleRooms(), [demo]);
  const clock = demo ? Date.parse(examples[0].latest_reading.measured_at) : now;
  const directory = useMemo(
    () => mergeDirectory(directoryRooms, live.rooms),
    [live.rooms],
  );
  const rooms = demo ? examples : directory;
  const staleAfter = live.staleAfterSeconds;
  const savedCount = rooms.filter((room) => saved.has(room.room_id)).length;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setLimit(12), [query, filter, building, sort, demo]);
  const buildings = [
    ...new Set(rooms.map((room) => room.location?.building).filter(Boolean)),
  ].sort();
  const reporting = rooms.filter(
    (room) => hasRecentReading(room, clock, staleAfter),
  );
  const matchesFilter = (room, kind) =>
    kind === "all" ||
    (kind === "saved"
      ? saved.has(room.room_id)
      : kind === "available"
        ? (availableSeats(room, clock, staleAfter) ?? 0) > 0
        : noiseBand(noiseReading(room, clock, staleAfter))?.level === "quiet");
  const filtered = rooms
    .filter(
      (room) =>
        matchesRoomSearch(room, query) &&
        matchesFilter(room, filter) &&
        (building === "all" || room.location?.building === building),
    )
    .sort((a, b) => {
      if (sort === "seats")
        return (
          (availableSeats(b, clock, staleAfter) ?? -1) -
            (availableSeats(a, clock, staleAfter) ?? -1) ||
          a.name.localeCompare(b.name)
        );
      if (sort === "recommended")
        return (
          Number(hasRecentReading(b, clock, staleAfter)) -
            Number(hasRecentReading(a, clock, staleAfter)) ||
          a.name.localeCompare(b.name)
        );
      return a.name.localeCompare(b.name);
    });
  const currentRoom = rooms.find((room) => room.room_id === selected);
  const initialLoading = !demo && live.status === "loading";
  function clearFilters() {
    setQuery("");
    setFilter("all");
    setBuilding("all");
  }
  function switchDemo(value) {
    setDemo(value);
    clearFilters();
    setSelected(null);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("demo", "1");
    else url.searchParams.delete("demo");
    window.history.replaceState(null, "", url);
  }
  return (
    <>
      <a className="skip-link" href="#spaces">
        Skip to study spaces
      </a>
      <header className="site-header">
        <div className="nav-wrap">
          <a className="brand-link" href="/" aria-label="SensoryAtlas home">
            <Brand />
          </a>
          <nav aria-label="Main navigation">
            <a className="nav-link active" href="#spaces">
              Find a space
            </a>
            <button className="nav-link" onClick={() => setHow(true)}>
              How it works
            </button>
          </nav>
          <button
            className="secondary-button nav-demo"
            onClick={() => switchDemo(!demo)}
          >
            {demo ? "Live mode" : "Demo mode"}
          </button>
          <button
            className="nav-saved"
            onClick={() => {
              setFilter("saved");
              spacesRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            aria-label={`Saved spaces${savedCount ? ` (${savedCount})` : ""}`}
          >
            <Heart size={18} />
            <span>Saved spaces</span>
            {savedCount > 0 && (
              <span className="saved-count">{savedCount}</span>
            )}
          </button>
        </div>
      </header>
      <main className="page-width">
        <section className="directory-header" aria-labelledby="hero-title">
          <div>
            <span className="eyebrow">
              <MapPin size={15} /> UBC Vancouver · study space directory
            </span>
            <h1 id="hero-title">
              Find a quiet spot at UBC<span>.</span>
            </h1>
            <p>
              Less wandering. More focusing. Check recent noise and occupancy
              readings before you head over.
            </p>
          </div>
        </section>
        <section
          className="spaces-section"
          ref={spacesRef}
          id="spaces"
          aria-label="Study spaces"
        >
          {demo && (
            <div className="demo-banner">
              <Info size={19} />
              <p>
                <strong>Demo mode.</strong> These rooms and readings are
                fictional examples. Coverage is simulated.
              </p>
              <button onClick={() => switchDemo(false)}>
                Return to live mode <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!demo && rooms.some(hasStaticDemo) && (
            <div className="demo-banner">
              <Info size={19} />
              <p><strong>Static demo data is shown.</strong> Fictional occupancy and sound values are saved examples and do not update. Community estimates are labeled separately.</p>
            </div>
          )}
          <div className="search-field">
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search study spaces"
              placeholder="Search by building or room"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                className="clear-search"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={19} />
              </button>
            )}
          </div>
          <div className="filter-row">
            <div
              className="filter-tabs"
              role="group"
              aria-label="Filter spaces"
            >
              {filters.map((item) => (
                <button
                  key={item.id}
                  className={filter === item.id ? "selected" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.id === "quiet" ? (
                    <AudioLines size={16} />
                  ) : item.id === "available" ? (
                    <Users size={16} />
                  ) : item.id === "saved" ? (
                    <Heart size={16} />
                  ) : null}
                  {item.label}
                  <span className="filter-count">
                    {
                      rooms.filter((room) => matchesFilter(room, item.id))
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="secondary-controls">
            <label className="select-field">
              <MapPin size={16} />
              <span className="sr-only">Building</span>
              <select
                value={building}
                onChange={(event) => setBuilding(event.target.value)}
              >
                <option value="all">All buildings</option>
                {buildings.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className="sort-field">
              <SlidersHorizontal size={16} />
              <span className="sr-only">Sort spaces</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="recommended">Recent readings first</option>
                <option value="name">Name: A–Z</option>
                <option value="seats">Most seats available</option>
              </select>
              <ChevronDown size={15} />
            </label>
          </div>
          <div className="coverage-row">
            <div>
              <h2>
                Study spaces <span>{filtered.length}</span>
              </h2>
              <p>
                {demo ? "Simulated: " : ""}
                {reporting.length} of {rooms.length} listed spaces have recent
                readings.
              </p>
            </div>
            <div className={`connection-status ${live.status}`} role="status">
              <span className="connection-dot" />
              {demo
                ? "Demo mode · simulated"
                : live.status === "ok"
                  ? "Connected"
                  : live.status === "error"
                    ? "Connection interrupted"
                    : "Connecting…"}
            </div>
          </div>
          {!demo && live.status === "error" && (
            <div className="error-banner" role="alert">
              <WifiOff size={19} />
              <p>
                {live.checkedAt
                  ? "Couldn’t refresh readings. Showing the last successful result; measurements continue to age."
                  : "Couldn’t load study spaces. You can still browse the saved UBC directory."}
              </p>
              <button onClick={live.retry}>
                Retry <RefreshCw size={16} />
              </button>
            </div>
          )}
          {!initialLoading && !demo && !reporting.length && (
            <div className="coverage-note">
              <Info size={17} />
              <p>
                Live readings are currently unavailable. Last recorded values
                are shown where available and labeled outdated.
              </p>
            </div>
          )}
          <div className="results-label">
            <span aria-live="polite">
              {initialLoading
                ? "Loading study spaces…"
                : `Showing ${Math.min(limit, filtered.length)} of ${filtered.length} spaces`}
            </span>
            <span>
              {demo
                ? "Fictional sample data"
                : live.checkedAt
                  ? `Last checked ${timeAgo(live.checkedAt, now).toLowerCase()}`
                  : "Limited live coverage"}
            </span>
          </div>
          {initialLoading ? (
            <div className="room-grid" aria-label="Loading spaces">
              {[0, 1, 2].map((i) => (
                <div className="room-skeleton" key={i}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <div className="room-grid">
              {filtered.slice(0, limit).map((room) => (
                <RoomCard
                  key={room.room_id}
                  room={room}
                  now={clock}
                  staleAfterSeconds={staleAfter}
                  saved={saved.has(room.room_id)}
                  onSave={toggle}
                  onOpen={(room) => setSelected(room.room_id)}
                  demo={demo}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h3>
                {rooms.length
                  ? "No spaces match just yet."
                  : "No listed spaces yet."}
              </h3>
              <p>
                {filter === "saved"
                  ? "Save a space with the heart to find it here next time."
                  : "Try another search or clear your filters."}
              </p>
              <button className="secondary-button" onClick={clearFilters}>
                Clear filters <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!initialLoading && limit < filtered.length && (
            <div className="load-more">
              <button
                className="secondary-button"
                onClick={() => setLimit((value) => value + 12)}
              >
                Show more spaces <ChevronDown size={16} />
              </button>
            </div>
          )}
          <div className="data-note">
            <span>
              <Info size={16} />
              Counts and sound levels are estimates. Coverage is limited to
              instrumented spaces.
            </span>
            <button onClick={() => setHow(true)}>
              About the readings <ArrowUpRight size={16} />
            </button>
          </div>
        </section>
      </main>
      <footer className="page-width site-footer">
        <Brand />
        <p>A little space to focus.</p>
        <span>
          Independent UBC project ·{" "}
          <a
            href="https://learningspaces.ubc.ca/find-a-space-informal/"
            target="_blank"
            rel="noreferrer"
          >
            Room metadata & photos: UBC Learning Spaces
          </a>
        </span>
      </footer>
      {how && <HowItWorks onClose={() => setHow(false)} />}
      {currentRoom && (
        <RoomDetails
          room={currentRoom}
          demo={demo}
          now={clock}
          staleAfterSeconds={staleAfter}
          saved={saved.has(currentRoom.room_id)}
          onSave={toggle}
          onClose={() => setSelected(null)}
          onReported={live.retry}
        />
      )}
    </>
  );
}
