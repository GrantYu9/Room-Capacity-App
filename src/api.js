export async function fetchJson(path, { signal, ...options } = {}) {
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
    const response = await fetch(path, { ...options, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed.");
    return body;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
