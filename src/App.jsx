import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  AudioLines,
  BookOpen,
  ChevronDown,
  Clock3,
  Compass,
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
  noiseBand,
  roomState,
  sampleHistory,
  sampleRooms,
  timeAgo,
  locationLabel,
  occupancyReading,
  noiseReading,
  hasStaticDemo,
  hasDisplayedOccupancy,
} from "./rooms.js";
import { useRooms, useSavedRooms } from "./useRooms.js";
import { fetchJson } from "./api.js";
import directoryRooms from "../data/rooms.json";
import UnmonitoredSpaces from "./UnmonitoredSpaces.jsx";
import { splitRoomSources } from "./roomSources.js";
import ReportForm from './ReportForm.jsx';
import { matchesRoomSearch } from './roomSearch.js';

function EstimateSource({ room, now }) {
  const values = [room.estimate?.occupancy, room.estimate?.noise].filter(value => value && now < Date.parse(value.expires_at));
  const recent = room.estimate?.reports?.recent ?? 0;
  if (!values.length && !recent) return null;
  return <p className="estimate-source">{values.length
    ? values.map((value, i) => `${i === 0 && value.people_count !== undefined ? 'Occupancy' : 'Noise'}: ${value.source} · ${value.report_count} contributing ${value.report_count === 1 ? 'report' : 'reports'}`).join(' / ')
    : `${recent} recent community ${recent === 1 ? 'report' : 'reports'} · no current contribution after filtering`}</p>;
}

const filters = [
  { id: "all", label: "All spaces" },
  { id: "available", label: "Space available" },
  { id: "quiet", label: "Quiet spaces" },
  { id: "saved", label: "Saved" },
];

function Brand({ small = false }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-mark">
        <Compass size={small ? 19 : 23} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span>
        Sensory <span className="brand-atlas">Atlas</span>
      </span>
    </span>
  );
}

function DeskIllustration() {
  return (
    <svg
      className="desk-illustration"
      viewBox="0 0 380 280"
      fill="none"
      aria-hidden="true"
    >
      <rect x="75" y="23" width="235" height="213" rx="112" fill="#e7e8d4" />
      <path
        d="M159 110V40M225 111V44M91 113h204"
        stroke="#faf9f3"
        strokeWidth="6"
      />
      <circle cx="246" cy="63" r="20" fill="#e4b96c" />
      <path
        d="M57 233h274"
        stroke="#d5d8c7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M92 163h220M109 165v68M292 165v68"
        stroke="#254e43"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect
        x="154"
        y="125"
        width="62"
        height="38"
        rx="4"
        fill="#f1d7a6"
        stroke="#b99b6c"
        strokeWidth="2"
      />
      <path d="m156 151 21-14 36 14" stroke="#b99b6c" strokeWidth="2" />
      <path
        d="M254 160v-55l-24-17"
        stroke="#254e43"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="m212 82 33 19-4-29-29 10Z" fill="#254e43" />
      <path d="m218 92-16 25 38 3-7-20" fill="#f2d59c" opacity=".55" />
      <path
        d="M128 209v24M176 209v24"
        stroke="#a66a4d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M124 183c0-13 12-21 27-21 17 0 29 8 29 21v22h-56v-22Z"
        fill="#cf8d6a"
      />
      <path
        d="M121 204h61"
        stroke="#a66a4d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M325 203c0-25-9-43-9-60M316 173c-21-1-27-17-21-29 16 3 24 16 21 29ZM318 159c18-4 24-20 17-31-14 6-21 19-17 31Z"
        fill="#72947a"
        stroke="#72947a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M303 201h32l-5 31h-22l-5-31Z" fill="#d7bc91" />
      <rect x="107" y="151" width="25" height="9" rx="2" fill="#a6b5a0" />
      <rect x="110" y="142" width="25" height="9" rx="2" fill="#e1bc7b" />
      <path
        d="M71 52v14m-7-7h14M324 96v10m-5-5h10"
        stroke="#a4af88"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
        // If an async action removes the focused control, native dialog focus
        // may land on the container. Restore a usable keyboard target inside.
        if (event.target === event.currentTarget) event.currentTarget.querySelector('button')?.focus();
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
    <Modal title="How Sensory Atlas works" onClose={onClose}>
      <span className="eyebrow">A little less guesswork</span>
      <h2>
        A good spot changes
        <br />
        your whole study session.
      </h2>
      <p className="modal-intro">
        Sensory Atlas brings crowding, sound readings, and community observations
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

function NoiseLevel({ reading, live }) {
  const band = live ? noiseBand(reading) : null;
  return (
    <div className="noise-level">
      <span
        className={`noise-wave ${band?.level ?? "unknown"}`}
        aria-hidden="true"
      >
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <div>
        <span className="metric-caption">
          Sound band{reading?.noise_unit === "relative" ? " · approximate" : ""}
        </span>
        <strong>{band?.label ?? "No current reading"}</strong>
      </div>
      <span className="noise-value">{live ? formatNoise(reading) : "—"}</span>
    </div>
  );
}

function RoomCard({
  room,
  now,
  staleAfterSeconds,
  saved,
  onSave,
  onOpen,
  index,
  demo,
}) {
  const state = roomState(room, now, staleAfterSeconds);
  const live = hasDisplayedOccupancy(room, now, staleAfterSeconds);
  const occupancy = occupancyReading(room, now);
  const sound = noiseReading(room, now, staleAfterSeconds);
  const count = live ? occupancy?.people_count : null;
  const capacity = room.total_capacity;
  const percent =
    live && occupancy?.fraction != null ? Math.min(100, occupancy.fraction * 100) : count != null && capacity ? Math.min(100, (count / capacity) * 100) : null;
  const seats = availableSeats(room, now, staleAfterSeconds);
  const location = locationLabel(room.location);
  return (
    <article
      className="room-card"
      style={{ "--card-delay": `${Math.min(index, 8) * 45}ms` }}
    >
      <div className={`room-card-cover cover-${index % 4}`}>
        <div className="cover-decoration" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <BookOpen
          size={31}
          strokeWidth={1.4}
          className="cover-book"
          aria-hidden="true"
        />
        <span className={`status-pill status-${state.key}`}>
          <span />
          {state.label}
        </span>
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          onClick={() => onSave(room.room_id)}
          aria-label={`${saved ? "Unsave" : "Save"} ${room.name}`}
          aria-pressed={saved}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="room-card-body">
        {(demo || room.latest_reading?.device_id?.startsWith("demo-")) && <p className="sample-label">{demo ? 'Fictional sample data' : 'Fictional sensor history'}</p>}
        <h3>{room.name}</h3>
        <p className="room-location">
          <MapPin size={14} aria-hidden="true" />
          {location || "Location not listed yet"}
        </p>
        <div className="occupancy-heading">
          <span>Estimated people</span>
          <span>
            <strong>{count ?? (percent != null ? `~${Math.round(percent)}% full` : "—")}</strong>
            <span className="capacity"> / {capacity ?? "—"}</span>
            <Users size={14} aria-hidden="true" />
          </span>
        </div>
        <div
          className={`occupancy-track ${percent == null ? "track-unknown" : ""}`}
          role={percent == null ? undefined : "progressbar"}
          aria-label={percent == null ? undefined : "Room occupancy"}
          aria-valuenow={percent == null ? undefined : count ?? percent}
          aria-valuemin={percent == null ? undefined : 0}
          aria-valuemax={
            percent == null ? undefined : count != null ? Math.max(capacity, count) : 100
          }
        >
          <span
            style={{ width: `${percent ?? 0}%` }}
            className={
              percent >= 100 ? "bar-full" : percent > 70 ? "bar-busy" : ""
            }
          />
        </div>
        <p className="seats-caption">
          {capacity == null ? (
            "Capacity unknown · available seats unknown"
          ) : !live ? (
            state.key === "waiting" ? (
              "Waiting for the first update"
            ) : (
              "Showing no current occupancy"
            )
          ) : seats === 0 ? (
            "0 estimated seats available"
          ) : (
            <>
              Estimated <span>{seats} {seats === 1 ? "seat" : "seats"}</span> available
            </>
          )}
        </p>
        <NoiseLevel reading={sound} live={Boolean(sound)} />
        <EstimateSource room={room} now={now} />
      </div>
      <div className="room-card-footer">
        <span
          title={room.latest_reading
            ? new Date(room.latest_reading.measured_at).toLocaleString()
            : undefined}
        >
          <Clock3 size={12} />
          {room.latest_reading
            ? `Measured ${timeAgo(room.latest_reading.measured_at, now).toLowerCase()}`
            : "No reading yet"}
        </span>
        <button onClick={() => onOpen(room)} aria-label={`View ${room.name}`}>
          View space <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}

function ActivityChart({ readings }) {
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
  const state = roomState(room, now, staleAfterSeconds);
  const live = hasDisplayedOccupancy(room, now, staleAfterSeconds);
  const occupancy = occupancyReading(room, now);
  const sound = noiseReading(room, now, staleAfterSeconds);
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
        {demo ? "Fictional sample data" : room.latest_reading?.device_id?.startsWith("demo-") ? 'Fictional sensor history' : "Your next place to focus"}
      </span>
      <h2>{room.name}</h2>
      <p className="detail-location">
        <MapPin size={16} />
        {location || "Location not listed yet"}
      </p>
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
          <span>Estimated people</span>
          <strong>
            {live ? occupancy?.people_count ?? (occupancy?.fraction != null ? `~${Math.round(occupancy.fraction * 100)}% full` : "—") : "—"}
            <small> / {room.total_capacity ?? "—"}</small>
          </strong>
        </div>
        <div>
          <AudioLines size={20} />
          <span>Sound band · approximate</span>
          <strong>
            {sound ? noiseBand(sound)?.label : "—"}
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
        <span>{demo ? "Up to 100 recent readings · fictional" : "Up to 100 recent readings · sensor history"}</span>
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
          Room information source <ArrowUpRight size={14} />
        </a>
      )}
    </Modal>
  );
}

export default function App() {
  const live = useRooms();
  const { saved, toggle } = useSavedRooms();
  const [now, setNow] = useState(Date.now());
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [building, setBuilding] = useState("all");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState(null);
  const [how, setHow] = useState(false);
  const spacesRef = useRef(null);
  const examples = useMemo(() => sampleRooms(), [demo]);
  const clock = demo ? Date.parse(examples[0].latest_reading.measured_at) : now;
  const sources = useMemo(() => splitRoomSources(directoryRooms, live.rooms), [live.rooms]);
  const rooms = demo ? examples : sources.monitored;
  const savedCount = rooms.filter((room) => saved.has(room.room_id)).length;
  const staleAfter = live.staleAfterSeconds;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const buildings = [
    ...new Set(rooms.map((r) => r.location?.building).filter(Boolean)),
  ].sort();
  const reporting = rooms.filter(
    (r) => hasDisplayedOccupancy(r, clock, staleAfter),
  );
  const staticDemoCount = rooms.filter(hasStaticDemo).length;
  const knownSeats = rooms
    .map((r) => availableSeats(r, clock, staleAfter))
    .filter((x) => x !== null);
  const counted = reporting.filter(r => Number.isFinite(occupancyReading(r, clock)?.people_count));
  const people = counted.length
    ? counted.reduce((sum, r) => sum + occupancyReading(r, clock).people_count, 0)
    : null;
  const seats = knownSeats.length
    ? knownSeats.reduce((sum, x) => sum + x, 0)
    : null;
  const matchesFilter = (room, kind) =>
    kind === "all" ||
    (kind === "saved"
      ? saved.has(room.room_id)
      : kind === "available"
        ? (availableSeats(room, clock, staleAfter) ?? 0) > 0
        : noiseBand(noiseReading(room, clock, staleAfter))?.level === "quiet");
  const filtered = rooms
    .filter((room) => {
      return (
        matchesRoomSearch(room, query) &&
        matchesFilter(room, filter) &&
        (building === "all" || room.location?.building === building)
      );
    })
    .sort((a, b) =>
      sort === "seats"
        ? (availableSeats(b, clock, staleAfter) ?? -1) -
            (availableSeats(a, clock, staleAfter) ?? -1) ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const currentRoom = selected
    ? rooms.find((r) => r.room_id === selected) ?? live.rooms.find(r => r.room_id === selected) ?? directoryRooms.filter(r => r.room_id === selected).map(r => ({ ...r, location: { building: r.building, room_number: r.room_number, address: r.address }, latest_reading: null, stale: true }))[0]
    : null;
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
  }
  function showSaved() {
    setFilter("saved");
    spacesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <>
      <a className="skip-link" href="#spaces">
        Skip to study spaces
      </a>
      <header className="site-header">
        <div className="nav-wrap">
          <a className="brand-link" href="#" aria-label="Sensory Atlas home">
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
            className="nav-saved"
            onClick={showSaved}
            aria-label={`Saved spaces${savedCount ? ` (${savedCount})` : ""}`}
          >
            <Heart size={17} />
            <span>Saved spaces</span>
            {savedCount > 0 && (
              <span className="saved-count">{savedCount}</span>
            )}
          </button>
        </div>
      </header>
      <main>
        <section className="hero page-width" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-star" aria-hidden="true">
                <Asterisk size={20} />
              </span>{" "}
              Your sensory guide to UBC · prototype
            </span>
            <h1 id="hero-title">
              Find a space
              <br />
              that feels <em>right.</em>
            </h1>
            <p>
              Find a UBC study space that suits you. Compare noise and crowding,
              see where estimates come from, and share a quick observation when
              you arrive.
            </p>
            <div className="hero-actions">
              <a href="#spaces" className="primary-button">
                Browse study spaces <ArrowDown size={16} />
              </a>
              <button
                className="secondary-button"
                onClick={() => {
                  switchDemo(true);
                  spacesRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Try sample preview <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-note">
              <span className="note-dot" />Less noise. A little more room.
            </div>
            <DeskIllustration />
            <span className="art-signature">A map of how places feel.</span>
          </div>
        </section>
        <section
          className="summary-section page-width"
          aria-label="Study space summary"
        >
          <div className="summary-intro">
            <span className="campus-label">
              <MapPin size={14} />
              {demo ? "Fictional sample data" : staticDemoCount ? "UBC spaces · demo data" : "Monitored UBC spaces"}
            </span>
            <h2>{demo ? "Sample preview" : "Limited coverage"}</h2>
          </div>
          <div className="summary-stat">
            <span className="stat-icon">
              <BookOpen size={20} strokeWidth={1.6} />
            </span>
            <div>
              <strong>
                {!demo && !live.checkedAt ? "—" : String(rooms.length).padStart(2, "0")}
              </strong>
              <span>{demo ? "Fictional sample rooms" : "Monitored rooms"}</span>
              <small>
                {initialLoading
                  ? "Checking for readings…"
                  : !demo && !live.checkedAt
                    ? "Coverage unavailable"
                    : staticDemoCount ? `${staticDemoCount} rooms show static demo values` : `${reporting.length} of ${rooms.length} rooms have recent readings`}
              </small>
            </div>
          </div>
          <div className="summary-stat">
            <span className="stat-icon">
              <DoorOpen size={21} strokeWidth={1.6} />
            </span>
            <div>
              <strong>{seats ?? "—"}</strong>
              <span>{demo ? "Sample estimated seats" : staticDemoCount ? "Demo / reported seats" : "Estimated available seats"}</span>
              <small>
                {knownSeats.length
                  ? `Across ${knownSeats.length} reporting ${knownSeats.length === 1 ? "space" : "spaces"}`
                  : "Waiting for capacity and readings"}
              </small>
            </div>
          </div>
          <div className="summary-stat">
            <span className="stat-icon">
              <Users size={21} strokeWidth={1.6} />
            </span>
            <div>
              <strong>{people ?? "—"}</strong>
              <span>{demo ? "Sample estimated people" : staticDemoCount ? "Demo / reported people" : "Estimated people"}</span>
              <small>
                {reporting.length
                  ? `Across ${reporting.length} ${staticDemoCount ? 'displayed' : 'recent'} ${reporting.length === 1 ? "space" : "spaces"}`
                  : "No recent readings"}
              </small>
            </div>
          </div>
        </section>
        <section
          className="spaces-section page-width"
          ref={spacesRef}
          id="spaces"
          aria-labelledby="spaces-heading"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow section-eyebrow">
                Your next favourite corner
              </span>
              <h2 id="spaces-heading">
                Find your space<span>.</span>
              </h2>
            </div>
            <span
              className={`connection-status ${demo ? "connection-demo" : live.status}`}
              role="status"
            >
              <span className="connection-dot" />
              {demo
                ? "Sample preview · fictional"
                : live.status === "ok"
                  ? "API reachable · checks every ~10s"
                  : live.status === "error"
                    ? "API refresh failed · retrying"
                    : "Connecting to API"}
            </span>
          </div>
          {demo && (
            <div className="demo-banner">
              <div>
                <Info size={18} />
                <p>
                  <strong>You’re exploring sample spaces.</strong> These rooms
                  and readings are fictional examples.
                </p>
              </div>
              <button onClick={() => switchDemo(false)}>
                Back to monitored rooms <ArrowRight size={15} />
              </button>
            </div>
          )}
          {!demo && rooms.some(room => room.latest_reading?.device_id?.startsWith("demo-")) && (
            <div className="demo-banner">
              <div>
                <Info size={18} />
                <p><strong>Static demo data is shown.</strong> Fictional occupancy and sound values are saved examples and do not update. Building and room details come from the UBC directory; community estimates are labeled separately.</p>
              </div>
            </div>
          )}
          <div className="search-row">
            <div className="search-field">
              <Search size={20} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search study spaces"
                placeholder="Search a room, building, alias, or address"
              />
              {query && (
                <button
                  className="clear-search"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={17} />
                </button>
              )}
              <span className="search-key" aria-hidden="true">
                Find your corner
              </span>
            </div>
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
                  {item.id === "saved" && <Heart size={13} />}
                  <span>{item.label}</span>
                  <span className="filter-count">
                    {
                      rooms.filter((room) => matchesFilter(room, item.id))
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
            <label className="sort-field">
              <SlidersHorizontal size={14} />
              <span className="sr-only">Sort spaces</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="name">Name: A–Z</option>
                <option value="seats">Most seats available</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          {!demo && live.status === "error" && (
            <div className="error-banner" role="alert">
              <WifiOff size={18} />
              <p>
                {live.checkedAt
                  ? `We couldn’t refresh the latest data. Last successful check: ${new Date(live.checkedAt).toLocaleString()} (${timeAgo(live.checkedAt, now).toLowerCase()}). Cached readings may be out of date.`
                  : "We couldn’t load monitored spaces. Retry or try the sample preview."}
              </p>
              <button onClick={live.retry}>
                Retry <RefreshCw size={14} />
              </button>
            </div>
          )}
          <div className="results-label" aria-live="polite">
            {initialLoading
              ? "Finding your spaces…"
              : `${filtered.length} ${filtered.length === 1 ? "space" : "spaces"}${query || building !== "all" || filter !== "all" ? " found" : " to explore"}`}
            <span>
              {demo
                ? "Fictional sample data"
                : live.checkedAt
                  ? `Last checked ${timeAgo(live.checkedAt, now).toLowerCase()}`
                  : "No successful API check yet"}
            </span>
          </div>
          {initialLoading ? (
            <div className="room-grid" aria-label="Loading spaces">
              {[0, 1, 2].map((i) => (
                <div className="room-skeleton" key={i}>
                  <div />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <div className="room-grid">
              {filtered.map((room, index) => (
                <RoomCard
                  key={room.room_id}
                  room={room}
                  now={clock}
                  staleAfterSeconds={staleAfter}
                  saved={saved.has(room.room_id)}
                  onSave={toggle}
                  onOpen={(room) => setSelected(room.room_id)}
                  index={index}
                  demo={demo}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {filter === "saved" ? (
                <Heart size={29} strokeWidth={1.4} />
              ) : (
                <Search size={29} strokeWidth={1.4} />
              )}
              <h3>
                {filter === "saved" && !query
                  ? "Keep a good spot close."
                  : rooms.length
                    ? "No spaces match just yet."
                    : live.status === "error"
                      ? "Monitored spaces unavailable."
                      : "No monitored rooms yet."}
              </h3>
              <p>
                {filter === "saved" && !query
                  ? "Tap the heart on a space to find it here next time."
                  : rooms.length
                    ? "Try another search or give your filters a little more room."
                    : live.status === "error"
                      ? "Use Retry to check the API again, or explore the fictional sample preview."
                      : "No monitored rooms are listed. Browse the unmonitored UBC directory below, or try the sample preview."}
              </p>
              {rooms.length > 0 && (
                <button className="secondary-button" onClick={clearFilters}>
                  Show all spaces <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {!demo && <UnmonitoredSpaces rooms={sources.unmonitored} onReport={room => setSelected(room.room_id)} />}
          {!demo && (
            <div className="preview-invitation">
              <span className="preview-icon">
                <BookOpen size={23} strokeWidth={1.5} />
              </span>
              <div>
                <h3>Explore a fictional study-space preview.</h3>
                <p>
                  Curious what room looks like with more spaces? Take a look at
                  the sample preview.
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => switchDemo(true)}
              >
                Explore sample spaces <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          <div className="data-note">
            <span>
              <span className="legend-dot" />
              {demo ? "Fictional readings for preview only." : "Measurements have their own timestamps."}
            </span>
            <button onClick={() => setHow(true)}>
              A note on the numbers <Info size={14} />
            </button>
          </div>
        </section>
        <section className="closing-note page-width">
          <span className="tiny-star" aria-hidden="true">
            <Asterisk size={20} />
          </span>
          <p>
            Find your place.
            <br />
            <em>At your own pace.</em>
          </p>
          <span className="closing-line" />
        </section>
      </main>
      <footer className="page-width site-footer">
        <Brand small />
        <p>A map of how places feel.</p>
        <span>An independent UBC prototype · limited coverage.</span>
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
