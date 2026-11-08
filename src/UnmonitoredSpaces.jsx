import { memo, useState } from "react";
import { ArrowUpRight, BookOpen, MapPin, Search } from "lucide-react";
import roomPhotos from "../data/room-images.json";
import { matchesRoomSearch } from "./roomSearch.js";

function UnmonitoredSpaces({ rooms }) {
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("all");
  const [limit, setLimit] = useState(12);
  const buildings = [...new Set(rooms.map((room) => room.building).filter(Boolean))].sort();
  const filtered = rooms.filter((room) =>
    (building === "all" || room.building === building) &&
    matchesRoomSearch(room, query),
  );
  const visible = filtered.slice(0, limit);

  return (
    <section className="unmonitored-section" aria-labelledby="unmonitored-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow section-eyebrow">UBC informal learning directory</span>
          <h3 id="unmonitored-heading">Unmonitored study spaces</h3>
        </div>
      </div>
      <p className="directory-intro">
        Browse real study locations and published capacity from UBC’s directory.
        These listings have no readings on this website. Current occupancy,
        sound levels and available seats are unknown. Photos and metadata from{" "}
        <a href="https://learningspaces.ubc.ca/find-a-space-informal/" target="_blank" rel="noreferrer">UBC Learning Spaces</a>.
      </p>
      <div className="search-row">
        <label className="search-field">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search unmonitored study spaces</span>
          <input
            type="search"
            placeholder="Search by space, building, or alias (e.g. Sauder)"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(12); }}
          />
        </label>
        <label className="select-field">
          <MapPin size={16} aria-hidden="true" />
          <span className="sr-only">Unmonitored building</span>
          <select value={building} onChange={(event) => { setBuilding(event.target.value); setLimit(12); }}>
            <option value="all">All directory buildings</option>
            {buildings.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="results-label" aria-live="polite">
        Showing {visible.length} of {filtered.length} unmonitored study spaces
        <span>Published metadata · no live readings</span>
      </p>
      {visible.length ? (
        <ul className="room-grid directory-grid">
          {visible.map((room) => (
            <li className="directory-card" key={room.room_id}>
              <div className="directory-photo">
                {roomPhotos.images[room.room_id] ? (
                  <img
                    src={roomPhotos.images[room.room_id].path}
                    alt={`${room.name} study area, from UBC Learning Spaces`}
                    loading="lazy"
                    decoding="async"
                    width="768"
                    height="512"
                  />
                ) : (
                  <div className="directory-photo-placeholder">
                    <BookOpen size={30} aria-hidden="true" />
                    <span>No photo published</span>
                  </div>
                )}
              </div>
              <span className="directory-badge"><BookOpen size={14} aria-hidden="true" /> Unmonitored</span>
              <h4>{room.name}</h4>
              <p className="directory-building">{room.building ?? "Building unknown"}</p>
              <p>{room.room_number ?? "Room or area unknown"}</p>
              <p className="directory-address"><MapPin size={14} aria-hidden="true" />{room.address ?? "Address unknown"}</p>
              <p className="directory-capacity">
                {room.total_capacity == null
                  ? "Capacity unknown"
                  : `Published capacity: ${room.total_capacity} seats`}
              </p>
              <p>Available seats unknown</p>
              <div className="directory-source">
                <span>Source checked {new Date(room.source_checked_at).toLocaleDateString()}</span>
                <a href={room.source_url} target="_blank" rel="noreferrer" aria-label={`View ${room.name} on UBC (opens in new tab)`}>
                  View on UBC <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h4>No directory spaces match.</h4>
          <p>Try another search or building.</p>
          <button className="secondary-button" onClick={() => { setQuery(""); setBuilding("all"); setLimit(12); }}>
            Clear directory filters
          </button>
        </div>
      )}
      {visible.length < filtered.length && (
        <button className="secondary-button directory-more" onClick={() => setLimit((value) => value + 12)}>
          Show more unmonitored spaces
        </button>
      )}
    </section>
  );
}

export default memo(UnmonitoredSpaces);
