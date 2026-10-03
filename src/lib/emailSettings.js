/**
 * Pure helpers shared by the notification dispatchers.
 *
 * Kept free of Supabase / Vite imports (no `import.meta`, no browser globals) so
 * these functions can be unit tested in plain Node. The dispatcher previously
 * carried its own copy of the recipient-email filter and that copy had lost the
 * backslash in `[^\s@]`, which silently rejected every address containing the
 * letter "s" (e.g. dopa-only-tm@forth.co.th, sakdipath.s@forth.co.th).
 */

/** RFC-ish single-token check used for every recipient/CC address. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value) => EMAIL_REGEX.test(String(value ?? '').trim());

/**
 * Split a comma-separated address field into unique, valid addresses.
 *
 * @param {string|string[]|null|undefined} value  raw settings value ("a@b.com, c@d.com")
 * @param {{ exclude?: string[] }} [options]      addresses to drop (e.g. everyone already in To)
 * @returns {string[]}
 */
export const parseEmailList = (value, { exclude = [] } = {}) => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const blocked = new Set((exclude || []).map((entry) => String(entry ?? '').trim().toLowerCase()));

  const seen = new Set();
  const result = [];

  raw.forEach((entry) => {
    const trimmed = String(entry ?? '').trim();
    if (!trimmed) return;
    const lowered = trimmed.toLowerCase();
    if (blocked.has(lowered) || seen.has(lowered)) return;
    if (!EMAIL_REGEX.test(trimmed)) return;
    seen.add(lowered);
    result.push(trimmed);
  });

  return result;
};

const parseSettingValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return value;
};

/**
 * Normalise `system_settings` rows (or an `admin_get_system_settings` payload)
 * into the two objects the dispatchers consume.
 *
 * `value` arrives as an object when the column is JSONB (the normal case) and as
 * a string if the caller already stringified it — both are accepted.
 *
 * @param {Array<{key: string, value: unknown}>|Record<string, unknown>|null} rows
 * @returns {{ notificationEvents: Record<string, any>, branding: Record<string, any> }}
 */
export const mergeNotificationSettings = (rows) => {
  const byKey = {};

  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (!row || typeof row !== 'object' || !row.key) return;
      byKey[row.key] = row.value;
    });
  } else if (rows && typeof rows === 'object') {
    Object.assign(byKey, rows);
  }

  const notificationEvents = parseSettingValue(byKey.notification_events);
  const branding = parseSettingValue(byKey.branding);

  return {
    notificationEvents: notificationEvents && typeof notificationEvents === 'object' ? notificationEvents : {},
    branding: branding && typeof branding === 'object' ? branding : {},
  };
};

/** Fallback used when Global Branding leaves the public base URL empty. */
export const DEFAULT_PUBLIC_BASE_URL = 'https://stockflowth.online';

/**
 * Self-hosted logo shipped in `public/images/` (300x90). Email clients cannot
 * resolve relative URLs, so the absolute production URL is required.
 */
export const DEFAULT_LOGO_URL = `${DEFAULT_PUBLIC_BASE_URL}/images/logo.png`;

/** True when the raw value already carries an explicit non-http(s) scheme. */
const hasForeignScheme = (raw) => /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw);

/**
 * Normalise an admin-typed absolute URL so joined paths never produce `//`:
 * trims, prepends a missing `https://`, strips trailing slashes and rejects
 * anything that is not http(s).
 *
 * @param {unknown} value      raw setting value (`https://x.com/`, `x.com`, ``)
 * @param {string} [fallback]  returned for blank/invalid input (pass `''` to detect "not set")
 * @returns {string}
 */
export const normalizeBaseUrl = (value, fallback = DEFAULT_PUBLIC_BASE_URL) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || hasForeignScheme(raw)) return fallback;

  const candidate = (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    if (!url.hostname) return fallback;
    return candidate;
  } catch {
    return fallback;
  }
};

/**
 * Join a normalised base with a route path, guaranteeing exactly one slash
 * between them. Query-only paths (`?order_id=X`) are appended as-is.
 *
 * @param {unknown} baseUrl      raw `branding.public_base_url`
 * @param {string} [routePath]   `/withdrawals`, `checkouts`, `?order_id=X`
 * @param {string} [fallbackBase]
 * @returns {string}
 */
export const buildActionUrl = (baseUrl, routePath = '', fallbackBase = DEFAULT_PUBLIC_BASE_URL) => {
  const base = normalizeBaseUrl(baseUrl, fallbackBase);
  const path = String(routePath ?? '');
  if (!path) return base;
  return `${base}${path.startsWith('/') || path.startsWith('?') ? path : `/${path}`}`;
};

/**
 * Validation gate for the Settings form. Deliberately accepts `localhost` so
 * local development can still save; rendering applies the stricter
 * `sanitizeHttpUrl` gate separately.
 */
export const isValidHttpUrl = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || hasForeignScheme(raw)) return false;

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
};

/** Heuristic used for a non-blocking warning only (CDN URLs often omit an extension). */
export const isLikelyImageUrl = (value) => /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(String(value ?? '').trim());
