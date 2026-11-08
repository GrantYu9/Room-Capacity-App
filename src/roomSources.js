// Match only stable identifiers; similar names do not establish room identity.
function sameRoom(left, right) {
  return left.room_id === right.room_id || Boolean(
    left.source_url && right.source_url &&
    left.source_url.replace(/\/$/, "") === right.source_url.replace(/\/$/, ""),
  );
}

export function splitRoomSources(catalog, apiRooms) {
  return {
    monitored: apiRooms.filter((room) =>
      room.latest_reading || !catalog.some((listing) => sameRoom(listing, room)),
    ),
    unmonitored: catalog.filter((listing) =>
      !apiRooms.some((room) => room.latest_reading && sameRoom(listing, room)),
    ),
  };
}
