// Shared fetch wrapper: sets a User-Agent, retries on 429/5xx with
// exponential backoff, and enforces a small delay between sequential calls
// so we stay polite to free public APIs (Wikipedia, Wikimedia Commons, USDA).

const USER_AGENT = "poultry-db/0.1 (mr.shahidali.sa@gmail.com)";
const MIN_GAP_MS = 200;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGap() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

/**
 * Fetch with retry/backoff and a polite User-Agent header.
 * Throws on network failure or a non-ok, non-retryable response.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function politeFetch(url, options = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= MAX_RETRIES) {
    await waitForGap();
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": USER_AGENT,
          ...(options.headers || {}),
        },
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status} for ${url}`);
        attempt += 1;
        if (attempt > MAX_RETRIES) break;
        const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        await sleep(backoff);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (attempt > MAX_RETRIES) break;
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

/**
 * Fetch JSON with the polite wrapper.
 * @param {string} url
 * @param {RequestInit} [options]
 */
export async function politeFetchJson(url, options = {}) {
  const response = await politeFetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export { USER_AGENT };
