export async function fetchJson(path, { signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out.", "TimeoutError")),
    12000,
  );
  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) throw new Error("Request failed.");
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
