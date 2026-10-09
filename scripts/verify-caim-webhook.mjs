// Behavioural verification for the CAIM inbound webhook (Integration Plan Phase 3).
// Plain Node script (no database, no child processes) so it runs under the DSH sandbox:
//   npm run verify:caim-webhook
//
// It executes the real Vercel handler with synthetic requests and asserts every security gate
// BEFORE any database work: method, HMAC signature, replay window, payload validation, and
// configuration failures. The RPC itself (process_caim_webhook_event) needs a live database and
// is covered by the migration's own verification guard when applied.
import crypto from 'node:crypto';

process.env.CAIM_WEBHOOK_SECRET = 'verify-caim-webhook-secret';
delete process.env.VITE_SUPABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  default: handler,
  signCaimPayload,
  verifyCaimSignature,
  checkCaimTimestamp,
  validateCaimPayload,
  resolveEventId,
  MAX_TIMESTAMP_DRIFT_SECONDS,
} = await import('../api/caim-webhook.js');

let failures = 0;
const rows = [];

const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  rows.push({
    status: pass ? 'PASS' : 'FAIL',
    label,
    detail: pass ? '' : 'got=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected),
  });
};

const createMockRes = () => {
  const state = { statusCode: null, payload: null, ended: false, headers: {} };
  const res = {
    setHeader: (key, value) => { state.headers[key] = value; },
    status(code) { state.statusCode = code; return res; },
    json(body) { state.payload = body; return res; },
    end() { state.ended = true; return res; },
  };
  return { res, state };
};

const basePayload = {
  event: 'claim.closed',
  eventId: 'CLM-2026-0089:unrepairable:CAM-HIK-89211',
  ticketId: 'CLM-2026-0089',
  serialNo: 'CAM-HIK-89211',
  repairResult: 'unrepairable',
  technicianNotes: 'ชิปประมวลผลไหม้ ไม่คุ้มค่าซ่อม',
  disposalMethod: 'electronic_waste',
  replacedNewSerialNo: null,
  closedAt: '2026-10-15T14:30:00.000Z',
  closedBy: 'ช่างเทคนิคศูนย์บริการ Forth',
};

const postRequest = (body, { signature, timestamp, headers = {} } = {}) => {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method: 'POST',
    headers: {
      'x-caim-signature': signature === undefined ? signCaimPayload(rawBody, process.env.CAIM_WEBHOOK_SECRET) : signature,
      'x-caim-timestamp': timestamp === undefined ? String(Math.floor(Date.now() / 1000)) : timestamp,
      ...headers,
    },
    body,
  };
};

const invoke = async (req) => {
  const { res, state } = createMockRes();
  await handler(req, res);
  return state;
};

// --- 1. HMAC signature -------------------------------------------------------
const canonicalBody = JSON.stringify(basePayload);
check(
  'signature accepts the exact signed body',
  verifyCaimSignature({
    signature: signCaimPayload(canonicalBody, process.env.CAIM_WEBHOOK_SECRET),
    candidates: [canonicalBody],
    secret: process.env.CAIM_WEBHOOK_SECRET,
  }),
  true
);
check(
  'signature rejects a tampered body',
  verifyCaimSignature({
    signature: signCaimPayload(canonicalBody, process.env.CAIM_WEBHOOK_SECRET),
    candidates: [canonicalBody.replace('CLM-2026-0089', 'CLM-2026-0090')],
    secret: process.env.CAIM_WEBHOOK_SECRET,
  }),
  false
);
check(
  'signature rejects the wrong secret',
  verifyCaimSignature({
    signature: signCaimPayload(canonicalBody, 'another-secret'),
    candidates: [canonicalBody],
    secret: process.env.CAIM_WEBHOOK_SECRET,
  }),
  false
);
check(
  'signature rejects malformed input',
  verifyCaimSignature({ signature: 'sha256=not-a-digest', candidates: [canonicalBody], secret: 'x' }),
  false
);

// --- 2. Replay window -------------------------------------------------------
const now = 1_800_000_000;
check('timestamp at -300s is accepted', checkCaimTimestamp(String(now - MAX_TIMESTAMP_DRIFT_SECONDS), now).ok, true);
check('timestamp at +300s is accepted', checkCaimTimestamp(String(now + MAX_TIMESTAMP_DRIFT_SECONDS), now).ok, true);
check('timestamp at -301s is rejected', checkCaimTimestamp(String(now - MAX_TIMESTAMP_DRIFT_SECONDS - 1), now).status, 400);
check('timestamp at +301s is rejected', checkCaimTimestamp(String(now + MAX_TIMESTAMP_DRIFT_SECONDS + 1), now).status, 400);
check('missing timestamp is rejected', checkCaimTimestamp(undefined, now).status, 400);
check('non-numeric timestamp is rejected', checkCaimTimestamp('yesterday', now).status, 400);

// --- 3. Payload validation --------------------------------------------------
check('payload without ticketId is rejected', validateCaimPayload({ ...basePayload, ticketId: '' }).status, 400);
check('unsupported event is rejected', validateCaimPayload({ ...basePayload, event: 'claim.opened' }).status, 422);
check('unsupported repairResult is rejected', validateCaimPayload({ ...basePayload, repairResult: 'pending' }).status, 422);
check('valid payload passes', validateCaimPayload(basePayload).valid, true);

// --- 4. Idempotency key -----------------------------------------------------
check('eventId comes from the payload', resolveEventId(basePayload, 'header-id'), basePayload.eventId);
check('eventId falls back to the header', resolveEventId({ ...basePayload, eventId: '' }, 'header-id'), 'header-id');
check(
  'eventId is derived when absent',
  resolveEventId({ ticketId: 'CLM-1', repairResult: 'repaired', serialNo: 'SN-1' }, ''),
  'CLM-1:repaired:SN-1'
);

// --- 5. Canonical JSON round trip (signature parity with the CAIM dispatcher)
check(
  'parsed body re-serializes byte-identically',
  JSON.stringify(JSON.parse(canonicalBody)) === canonicalBody,
  true
);

// --- 6. Handler gates -------------------------------------------------------
check('OPTIONS returns 200', (await invoke({ method: 'OPTIONS', headers: {} })).statusCode, 200);
check('GET returns 405', (await invoke({ method: 'GET', headers: {} })).statusCode, 405);
check('POST without signature returns 401', (await invoke(postRequest(basePayload, { signature: '' }))).statusCode, 401);
check(
  'POST with a wrong signature returns 401',
  (await invoke(postRequest(basePayload, { signature: 'sha256=' + 'a'.repeat(64) }))).statusCode,
  401
);
check(
  'POST signed for a different body returns 401',
  (await invoke(
    postRequest(basePayload, {
      signature: signCaimPayload(JSON.stringify({ ...basePayload, ticketId: 'CLM-OTHER' }), process.env.CAIM_WEBHOOK_SECRET),
    })
  )).statusCode,
  401
);
check(
  'POST with a stale timestamp returns 400',
  (await invoke(postRequest(basePayload, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) }))).statusCode,
  400
);
check(
  'POST without a timestamp returns 400',
  (await invoke(postRequest(basePayload, { timestamp: '' }))).statusCode,
  400
);
check(
  'POST with an unsupported repairResult returns 422',
  (await invoke(postRequest({ ...basePayload, repairResult: 'unknown' }))).statusCode,
  422
);
check(
  'POST with an unsupported event returns 422',
  (await invoke(postRequest({ ...basePayload, event: 'claim.opened' }))).statusCode,
  422
);
check(
  'POST without ticketId returns 400',
  (await invoke(postRequest({ ...basePayload, ticketId: '' }))).statusCode,
  400
);
check(
  'POST with malformed JSON returns 400',
  (await invoke({
    method: 'POST',
    headers: {
      'x-caim-signature': signCaimPayload('{not-json', process.env.CAIM_WEBHOOK_SECRET),
      'x-caim-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: '{not-json',
  })).statusCode,
  400
);
check(
  'valid signed payload reaches the database layer (500 = missing Supabase env)',
  (await invoke(postRequest(basePayload))).statusCode,
  500
);
check(
  'raw-string body signed as-is is accepted (422 = passed the signature gate)',
  (await invoke(
    postRequest(JSON.stringify({ ...basePayload, event: 'claim.opened' }), {
      headers: { 'x-caim-event-id': 'CLM-1:repaired:SN-1' },
    })
  )).statusCode,
  422
);

// --- report -----------------------------------------------------------------
for (const row of rows) {
  console.log(`[${row.status}] ${row.label}${row.detail ? ' — ' + row.detail : ''}`);
}
console.log(`
${rows.length - failures}/${rows.length} checks passed`);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exitCode = 1;
}
