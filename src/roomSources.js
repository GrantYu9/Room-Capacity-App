// Match only stable identifiers; similar names do not establish room identity.
function sameRoom(left, right) {
  return (
    left.room_id === right.room_id ||
    Boolean(
      left.source_url &&
      right.source_url &&
      left.source_url.replace(/\/$/, "") ===
        right.source_url.replace(/\/$/, ""),
    )
  );
}

export function splitRoomSources(catalog, apiRooms) {
  return {
    monitored: apiRooms.filter(
      (room) =>
        room.latest_reading ||
        !catalog.some((listing) => sameRoom(listing, room)),
    ),
    unmonitored: catalog.filter(
      (listing) =>
        !apiRooms.some(
          (room) => room.latest_reading && sameRoom(listing, room),
        ),
    ),
  };
}

// Enrich API records without replacing the stable IDs used by sensors and saves.
export function mergeDirectory(catalog, apiRooms) {
  const normalize = (room) => ({
    ...room,
    location: room.location ?? {
      building: room.building,
      room_number: room.room_number,
      address: room.address,
      latitude: room.latitude,
      longitude: room.longitude,
    },
  });
  const merged = apiRooms.map((room) => {
    const listing = catalog.find((entry) => sameRoom(entry, room));
    if (!listing) return normalize(room);
    const metadata = normalize(listing);
    return {
      ...metadata,
      ...room,
      catalog_id: listing.room_id,
      source_url: room.source_url ?? listing.source_url,
      total_capacity: room.total_capacity ?? listing.total_capacity,
      location: Object.fromEntries(
        Object.keys({ ...metadata.location, ...room.location }).map((key) => [
          key,
          room.location?.[key] ?? metadata.location[key],
        ]),
      ),
    };
  });
  return [
    ...merged,
    ...catalog
      .filter((listing) => !apiRooms.some((room) => sameRoom(listing, room)))
      .map(normalize),
  ];
}
