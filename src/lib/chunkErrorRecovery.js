export const CHUNK_RELOAD_STORAGE_KEY = 'stockflow_chunk_reload_ts';
export const CHUNK_RELOAD_COOLDOWN_MS = 15000;

const CHUNK_ERROR_PATTERNS = [
  'dynamically imported module',
  'failed to fetch dynamically imported module',
  'failed to load module script',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unable to preload css',
  'loading chunk',
  'loading css chunk',
  'expected a javascript-or-wasm module script',
  'mime type of text/html',
];

/**
 * Checks whether an error or error event was caused by a stale or failed dynamic import / chunk load.
 * @param {Error|string|Event|null|undefined} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  const message = (
    typeof error === 'string'
      ? error
      : (error?.message || '') +
        ' ' +
        (error?.name || '') +
        ' ' +
        (error?.stack || '') +
        ' ' +
        (error?.payload?.message || '')
  ).toLowerCase();

  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Checks whether an auto-reload can be safely triggered without entering an infinite loop.
 * @param {Storage|null} [storage]
 * @param {number} [now]
 * @param {number} [cooldownMs]
 * @returns {boolean}
 */
export function canTriggerChunkReload(
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null),
  now = Date.now(),
  cooldownMs = CHUNK_RELOAD_COOLDOWN_MS
) {
  if (!storage) return false;
  try {
    const lastReload = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (!lastReload) return true;
    const parsed = parseInt(lastReload, 10);
    if (isNaN(parsed)) return true;
    return now - parsed > cooldownMs;
  } catch {
    return false;
  }
}

/**
 * Records the reload attempt timestamp in sessionStorage.
 * @param {Storage|null} [storage]
 * @param {number} [now]
 */
export function markChunkReload(
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null),
  now = Date.now()
) {
  if (!storage) return;
  try {
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Ignore storage quota or access errors in private browsing
  }
}

/**
 * Clears the reload cooldown in sessionStorage (useful for manual user clicks).
 * @param {Storage|null} [storage]
 */
export function clearChunkReloadCooldown(
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null)
) {
  if (!storage) return;
  try {
    storage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

/**
 * Global listener for Vite's preloadError event to recover from stale chunks on route transitions.
 */
export function initVitePreloadErrorHandler() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    if (canTriggerChunkReload()) {
      markChunkReload();
      window.location.reload();
      return;
    }
    console.warn(
      '[Stock-Flow] Repeated chunk preload error detected within cooldown window. Suppressing auto-reload loop.',
      event?.payload || event
    );
  });
}
