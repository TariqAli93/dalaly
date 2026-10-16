export async function withDeadline(operation, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, init = {}, timeoutMs = 6000) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json();
  return { status: response.status, body };
}

export async function pollApiHealth(
  url,
  timeoutMs = 30000,
  onChecking = () => {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await fetchJson(
        url,
        {},
        Math.min(6000, deadline - Date.now()),
      );
      if (status === 200 && body.ok === true) {
        if (body.startup_state === "CHECKING") onChecking();
        if (["SETUP_REQUIRED", "READY", "ERROR"].includes(body.startup_state))
          return body;
      }
    } catch {
      /* Backend may still be starting; retry within the total deadline. */
    }
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(350, remaining)),
      );
  }
  throw new Error("STARTUP_BACKEND_TIMEOUT");
}
