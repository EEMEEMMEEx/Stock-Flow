import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const DEFAULT_VAPID_SUBJECT = 'mailto:admin@stockflowth.online';
const DEFAULT_TTL_SECONDS = 86400;
const DEFAULT_VAPID_EXPIRY_SECONDS = 12 * 3600;
const RECORD_SIZE = 4096;
const UNCOMPRESSED_EC_KEY_LENGTH = 65;
const RAW_EC_COORD_LENGTH = 32;
const AUTH_SECRET_LENGTH = 16;
const SALT_LENGTH = 16;

export function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

export function base64UrlDecode(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error('Expected non-empty base64url string');
  }
  const normalized = str.trim();
  if (!/^[A-Za-z0-9\-_]+=*$/.test(normalized)) {
    throw new Error('Invalid base64url characters');
  }
  return Buffer.from(normalized, 'base64url');
}

export function generateVapidKeys() {
  const { privateKey: privateKeyObj } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = privateKeyObj.export({ format: 'jwk' });
  const xBuf = base64UrlDecode(jwk.x);
  const yBuf = base64UrlDecode(jwk.y);
  const dBuf = base64UrlDecode(jwk.d);

  if (
    xBuf.length !== RAW_EC_COORD_LENGTH ||
    yBuf.length !== RAW_EC_COORD_LENGTH ||
    dBuf.length !== RAW_EC_COORD_LENGTH
  ) {
    throw new Error('Generated VAPID P-256 key coordinates have unexpected length');
  }

  const uncompressedPublicKey = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);
  return {
    publicKey: base64UrlEncode(uncompressedPublicKey),
    privateKey: jwk.d,
  };
}

function parseUncompressedP256PublicKey(publicKeyB64) {
  const publicKeyBuf = base64UrlDecode(publicKeyB64);
  if (publicKeyBuf.length !== UNCOMPRESSED_EC_KEY_LENGTH || publicKeyBuf[0] !== 0x04) {
    throw new Error('Invalid uncompressed P-256 public key');
  }
  return publicKeyBuf;
}

export function createVapidAuthHeader({
  endpoint,
  subject = DEFAULT_VAPID_SUBJECT,
  publicKey,
  privateKey,
  expSeconds,
}) {
  if (!endpoint || !publicKey || !privateKey) {
    throw new Error('endpoint, publicKey, and privateKey are required for VAPID signing');
  }

  const origin = new URL(endpoint).origin;
  if (!origin || origin === 'null') {
    throw new Error('Push endpoint must have a valid origin');
  }

  const publicKeyBuf = parseUncompressedP256PublicKey(publicKey);
  const privateKeyBuf = base64UrlDecode(privateKey);
  if (privateKeyBuf.length !== RAW_EC_COORD_LENGTH) {
    throw new Error('Invalid VAPID private key length');
  }

  const x = base64UrlEncode(publicKeyBuf.subarray(1, 33));
  const y = base64UrlEncode(publicKeyBuf.subarray(33, 65));
  const privateKeyObj = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: base64UrlEncode(privateKeyBuf),
    },
    format: 'jwk',
  });

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: origin,
    exp: expSeconds || Math.floor(Date.now() / 1000) + DEFAULT_VAPID_EXPIRY_SECONDS,
    sub: subject,
  };

  const unsignedToken = `${base64UrlEncode(Buffer.from(JSON.stringify(header), 'utf8'))}.${base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))}`;
  const signature = crypto.sign('sha256', Buffer.from(unsignedToken, 'utf8'), {
    key: privateKeyObj,
    dsaEncoding: 'ieee-p1363',
  });
  const jwt = `${unsignedToken}.${base64UrlEncode(signature)}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    token: jwt,
    publicKey,
  };
}

export function encryptWebPushPayload(payload, subscriptionKeys, options = {}) {
  if (!subscriptionKeys?.p256dh || !subscriptionKeys?.auth) {
    throw new Error('Subscription keys p256dh and auth are required');
  }

  const payloadBuffer = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(String(payload), 'utf8');

  const uaPublic = parseUncompressedP256PublicKey(subscriptionKeys.p256dh);
  const authSecret = base64UrlDecode(subscriptionKeys.auth);
  if (authSecret.length !== AUTH_SECRET_LENGTH) {
    throw new Error('Invalid subscription auth secret length');
  }

  const salt = options.salt ? Buffer.from(options.salt) : crypto.randomBytes(SALT_LENGTH);
  if (salt.length !== SALT_LENGTH) {
    throw new Error('Invalid encryption salt length');
  }

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  );
  const nonce = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)
  );

  // RFC 8188 final-record padding delimiter (0x02)
  const paddedPlaintext = Buffer.concat([payloadBuffer, Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(paddedPlaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const recordSizeBuf = Buffer.alloc(4);
  recordSizeBuf.writeUInt32BE(RECORD_SIZE, 0);
  const header = Buffer.concat([
    salt,
    recordSizeBuf,
    Buffer.from([asPublic.length]),
    asPublic,
  ]);

  return {
    ciphertext: Buffer.concat([header, encrypted, authTag]),
    salt,
    localPublicKey: asPublic,
  };
}

export async function sendWebPushNotification(
  subscription,
  payloadObject,
  vapidKeys,
  fetchImpl = globalThis.fetch
) {
  if (!subscription?.endpoint || !subscription?.keys) {
    throw new Error('Valid push subscription with endpoint and keys is required');
  }
  if (!vapidKeys?.publicKey || !vapidKeys?.privateKey) {
    throw new Error('VAPID publicKey and privateKey are required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is unavailable');
  }

  const serializedPayload =
    typeof payloadObject === 'string' || Buffer.isBuffer(payloadObject)
      ? payloadObject
      : JSON.stringify(payloadObject);

  const { ciphertext } = encryptWebPushPayload(serializedPayload, subscription.keys);
  const { authorization } = createVapidAuthHeader({
    endpoint: subscription.endpoint,
    subject: vapidKeys.subject || DEFAULT_VAPID_SUBJECT,
    publicKey: vapidKeys.publicKey,
    privateKey: vapidKeys.privateKey,
  });

  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(ciphertext.length),
      TTL: String(DEFAULT_TTL_SECONDS),
      Urgency: 'high',
      Authorization: authorization,
    },
    body: ciphertext,
  });

  return {
    ok: Boolean(response.ok),
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
