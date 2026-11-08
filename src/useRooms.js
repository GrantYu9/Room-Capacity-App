import { useEffect, useState } from "react";
import { fetchJson } from "./api.js";

export function useRooms() {
  const [state, setState] = useState({
    rooms: [],
    status: "loading",
    checkedAt: null,
    staleAfterSeconds: 60,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer;
    let controller;
    async function refresh() {
      controller = new AbortController();
      try {
        const body = await fetchJson("/api/rooms", {
          signal: controller.signal,
        });
        if (!Array.isArray(body.rooms))
          throw new Error("Unexpected room data.");
        if (!disposed)
          setState({
            rooms: body.rooms,
            status: "ok",
            checkedAt: Date.now(),
            staleAfterSeconds: body.stale_after_seconds ?? 60,
          });
      } catch (error) {
        if (!disposed && error.name !== "AbortError")
          setState((previous) => ({ ...previous, status: "error" }));
      } finally {
        if (!disposed) timer = setTimeout(refresh, 10000);
      }
    }
    refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

export function useSavedRooms() {
  const [saved, setSaved] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem("room.saved") || "[]");
      return new Set(
        Array.isArray(value)
          ? value.filter((id) => typeof id === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  function toggle(id) {
    setSaved((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("room.saved", JSON.stringify([...next]));
      } catch {
        /* Saving is optional. */
      }
      return next;
    });
  }
  return { saved, toggle };
}
