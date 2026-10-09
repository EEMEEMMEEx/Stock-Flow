import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * CAIM Inbound Webhook (Integration Plan Phase 3)
 * ---------------------------------------------------------------------------
 * POST /api/caim-webhook receives "claim.closed" events from CAIM (Phase 2) and updates
 * Stock-Flow inventory atomically through the RPC public.process_caim_webhook_event:
 *   - unrepairable            -> scrap_disposal_items (สต็อกไม่ขยับ)
 *   - repaired / replaced_new -> stock_in (รับเข้า 1 หน่วย)
 *
 * Security gates (all executed before any database work):
 *   1. HMAC-SHA256 signature header "x-caim-signature: sha256=<hex>" over the raw JSON body
 *      with CAIM_WEBHOOK_SECRET, compared with crypto.timingSafeEqual.
 *   2. Replay window "x-caim-timestamp" (unix seconds) within ±300 seconds.
 *   3. Idempotency: eventId (payload, header, or derived) is UNIQUE in caim_webhook_logs.
 *
 * The signature is checked against the raw request body when the stream is still readable and
 * otherwise against the canonical JSON serialization of the parsed body, so platforms that
 * pre-parse the body still verify successfully.
 */

const SIGNATURE_HEADER = 'x-caim-signature';
const TIMESTAMP_HEADER = 'x-caim-timestamp';
const EVENT_ID_HEADER = 'x-caim-event-id';
export const MAX_TIMESTAMP_DRIFT_SECONDS = 300;
export const SUPPORTED_EVENTS = ['claim.closed'];
export const SUPPORTED_REPAIR_RESULTS = ['unrepairable', 'repaired', 'replaced_new'];

/** Normalize the "sha256=<hex>" header value into a lowercase hex digest. */
export function normalizeSignature(value) {
  return String(value || '').trim().replace(/^sha256=/i, '').toLowerCase();
}

/** HMAC-SHA256 hex digest of the exact raw body, prefixed with "sha256=". */
export function signCaimPayload(rawBody, secret) {
  return `sha256=${crypto.createHmac('sha256', String(secret)).update(String(rawBody), 'utf8').digest('hex')}`;
}

/** Timing-safe comparison of the provided signature against every acceptable body candidate. */
export function verifyCaimSignature({ signature, candidates, secret }) {
  const provided = normalizeSignature(signature);
  if (!provided || !/^[0-9a-f]{64}$/.test(provided)) return false;
  if (!secret) return false;

  const providedBuffer = Buffer.from(provided, 'hex');
  for (const candidate of candidates || []) {
    if (typeof candidate !== 'string' || !candidate.length) continue;
    const expected = crypto.createHmac('sha256', String(secret)).update(candidate, 'utf8').digest();
    if (expected.length === providedBuffer.length && crypto.timingSafeEqual(expected, providedBuffer)) {
      return true;
    }
  }
  return false;
}

/** Validate the replay window. Returns { ok, status, error }. */
export function checkCaimTimestamp(timestamp, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = MAX_TIMESTAMP_DRIFT_SECONDS) {
  const raw = String(timestamp ?? '').trim();
  if (!raw) {
    return { ok: false, status: 400, error: `Missing ${TIMESTAMP_HEADER} header` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, status: 400, error: `Invalid ${TIMESTAMP_HEADER} header` };
  }
  const drift = Math.abs(nowSeconds - Math.floor(parsed));
  if (drift > toleranceSeconds) {
    return {
      ok: false,
      status: 400,
      error: `Timestamp outside the ±${toleranceSeconds}s replay window (drift ${drift}s)`,
    };
  }
  return { ok: true, drift };
}

/** Validate the event envelope. Returns { valid, status, error }. */
export function validateCaimPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, status: 400, error: 'Request body must be a JSON object' };
  }
  const event = String(payload.event || '').trim();
  if (!SUPPORTED_EVENTS.includes(event)) {
    return { valid: false, status: 422, error: `Unsupported event: ${event || '(missing)'}` };
  }
  const ticketId = String(payload.ticketId || '').trim();
  if (!ticketId) {
    return { valid: false, status: 400, error: 'ticketId is required' };
  }
  const repairResult = String(payload.repairResult || '').trim();
  if (!SUPPORTED_REPAIR_RESULTS.includes(repairResult)) {
    return { valid: false, status: 422, error: `Unsupported repairResult: ${repairResult || '(missing)'}` };
  }
  return { valid: true };
}

/** Deterministic idempotency key, mirroring the CAIM dispatcher when the field is absent. */
export function resolveEventId(payload, headerEventId) {
  const fromPayload = String(payload?.eventId || '').trim();
  if (fromPayload) return fromPayload;
  const fromHeader = String(headerEventId || '').trim();
  if (fromHeader) return fromHeader;
  const serial = String(payload?.replacedNewSerialNo || payload?.serialNo || '-').trim() || '-';
  return `${String(payload?.ticketId || '').trim()}:${String(payload?.repairResult || '').trim()}:${serial}`;
}

/** Read the raw request body when the platform left the stream unread. */
async function readRawBody(req) {
  try {
    if (!req || typeof req[Symbol.asyncIterator] !== 'function') return null;
    if (req.readableEnded || req.complete) return null;
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    if (!chunks.length) return null;
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return null;
  }
}

function uniqueCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string' || !item.length || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Caim-Signature, X-Caim-Timestamp, X-Caim-Event-Id'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  // 1. Body candidates (raw stream first, canonical JSON otherwise)
  const streamRaw = await readRawBody(req);
  const candidates = uniqueCandidates([
    typeof req.body === 'string' ? req.body : null,
    streamRaw,
    req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : null,
  ]);

  // 2. Replay window (before signature work)
  const timestampCheck = checkCaimTimestamp(
    req.headers?.[TIMESTAMP_HEADER] || req.headers?.[TIMESTAMP_HEADER.toUpperCase()]
  );
  if (!timestampCheck.ok) {
    console.warn(`[caim-webhook] rejected: ${timestampCheck.error}`);
    return res.status(timestampCheck.status).json({ success: false, message: timestampCheck.error });
  }

  // 3. HMAC signature
  const webhookSecret = process.env.CAIM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[caim-webhook] server configuration error: CAIM_WEBHOOK_SECRET is not set');
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: Missing CAIM_WEBHOOK_SECRET',
    });
  }

  const signature = req.headers?.[SIGNATURE_HEADER] || req.headers?.[SIGNATURE_HEADER.toUpperCase()];
  if (!verifyCaimSignature({ signature, candidates, secret: webhookSecret })) {
    console.warn('[caim-webhook] rejected: invalid or missing x-caim-signature');
    return res.status(401).json({ success: false, message: 'Unauthorized: invalid webhook signature' });
  }

  // 4. Parse + validate payload
  let payload = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        payload = parsed;
        break;
      }
    } catch {
      // try the next candidate
    }
  }
  if (!payload && req.body && typeof req.body === 'object') {
    payload = req.body;
  }

  const validation = validateCaimPayload(payload);
  if (!validation.valid) {
    console.warn(`[caim-webhook] rejected payload: ${validation.error}`);
    return res.status(validation.status).json({ success: false, message: validation.error });
  }

  const eventId = resolveEventId(payload, req.headers?.[EVENT_ID_HEADER] || req.headers?.[EVENT_ID_HEADER.toUpperCase()]);

  if (String(payload.repairResult).trim() === 'replaced_new' && !String(payload.replacedNewSerialNo || '').trim()) {
    console.warn(`[caim-webhook] ${eventId}: replaced_new without replacedNewSerialNo; receiving stock without a new S/N`);
  }

  // 5. Database work (service role only)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: Missing Supabase URL or Service Role Key',
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await supabaseAdmin.rpc('process_caim_webhook_event', {
      p_payload: { ...payload, eventId },
    });

    if (error) {
      const rpcMessage = error.message || 'Database error while processing the CAIM webhook';
      const isClientError = /^(Unsupported|ticketId is required|Unauthorized)/i.test(rpcMessage);
      console.error(`[caim-webhook] ${eventId} RPC failed: ${rpcMessage}`);

      return res.status(isClientError ? 422 : 500).json({
        success: false,
        event_id: eventId,
        message: rpcMessage,
      });
    }

    const result = data && typeof data === 'object' ? data : {};

    if (result.status === 'failed') {
      console.error(`[caim-webhook] ${eventId} processing failed: ${result.message || 'unknown error'}`);
      return res.status(500).json({ success: false, event_id: eventId, ...result });
    }

    console.info(
      `[caim-webhook] ${eventId} status=${result.status || 'unknown'} repair=${result.repair_result || payload.repairResult}`
    );

    return res.status(200).json({
      success: result.success !== false,
      event_id: eventId,
      status: result.status || 'processed',
      duplicate: Boolean(result.duplicate),
      repair_result: result.repair_result || payload.repairResult,
      return_log_id: result.return_log_id || null,
      stock_in_order_id: result.stock_in_order_id || null,
      scrap_disposal_id: result.scrap_disposal_id || null,
      message: result.message || 'ประมวลผลผลการซ่อมจาก CAIM เรียบร้อยแล้ว',
    });
  } catch (err) {
    const message = err?.message || 'Unexpected error while processing the CAIM webhook';
    console.error(`[caim-webhook] ${eventId} unexpected error:`, err);
    return res.status(500).json({ success: false, event_id: eventId, message });
  }
}
