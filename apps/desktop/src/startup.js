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
  retryMs = 350,
) {
  const deadline = Date.now() + timeoutMs;
  // Once the API answers CHECKING, ask it (?wait=1) to reply only when its
  // database preparation settles. Polling instead left up to one retry
  // interval between the database being ready and the window opening, which
  // split launches into a fast and a ~350 ms slower group.
  let waitForPreparation = false;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await fetchJson(
        waitForPreparation ? `${url}?wait=1` : url,
        {},
        Math.min(6000, deadline - Date.now()),
      );
      if (status === 200 && body.ok === true) {
        if (["SETUP_REQUIRED", "READY", "ERROR"].includes(body.startup_state))
          return body;
        if (body.startup_state === "CHECKING") {
          onChecking();
          if (!waitForPreparation) {
            waitForPreparation = true;
            continue;
          }
        }
      }
    } catch {
      /* Backend may still be starting; retry within the total deadline. */
    }
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(retryMs, remaining)),
      );
  }
  throw new Error("STARTUP_BACKEND_TIMEOUT");
}
