import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  base64UrlEncode,
  base64UrlDecode,
  generateVapidKeys,
  createVapidAuthHeader,
  encryptWebPushPayload,
  sendWebPushNotification,
} from '../webPushCrypto.js';

function createMockSubscription() {
  const uaEcdh = crypto.createECDH('prime256v1');
  uaEcdh.generateKeys();
  const uaPublic = uaEcdh.getPublicKey();
  const authSecret = crypto.randomBytes(16);

  return {
    uaEcdh,
    uaPublic,
    authSecret,
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-device-token-123',
      keys: {
        p256dh: base64UrlEncode(uaPublic),
        auth: base64UrlEncode(authSecret),
      },
    },
  };
}

function decryptAes128GcmPacket(ciphertext, uaEcdh, uaPublic, authSecret) {
  const salt = ciphertext.subarray(0, 16);
  const rs = ciphertext.readUInt32BE(16);
  const idlen = ciphertext[20];
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);

  const asPublic = ciphertext.subarray(21, 21 + idlen);
  const encryptedAndTag = ciphertext.subarray(21 + idlen);
  const authTag = encryptedAndTag.subarray(encryptedAndTag.length - 16);
  const encrypted = encryptedAndTag.subarray(0, encryptedAndTag.length - 16);

  const sharedSecret = uaEcdh.computeSecret(asPublic);
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

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  assert.equal(decrypted[decrypted.length - 1], 2);
  return decrypted.subarray(0, decrypted.length - 1);
}

test('generateVapidKeys produces 65-byte uncompressed public key and 32-byte private key', () => {
  const keys = generateVapidKeys();
  const pubBuf = base64UrlDecode(keys.publicKey);
  const privBuf = base64UrlDecode(keys.privateKey);

  assert.equal(pubBuf.length, 65);
  assert.equal(pubBuf[0], 0x04);
  assert.equal(privBuf.length, 32);
  assert.equal(keys.publicKey.includes('='), false);
  assert.equal(keys.privateKey.includes('='), false);

  const secondKeys = generateVapidKeys();
  assert.notEqual(secondKeys.publicKey, keys.publicKey);
  assert.notEqual(secondKeys.privateKey, keys.privateKey);
});

test('createVapidAuthHeader produces a valid 3-part ES256 JWT verifiable with public key', () => {
  const { publicKey, privateKey } = generateVapidKeys();
  const expSeconds = Math.floor(Date.now() / 1000) + 3600;
  const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/abc123';

  const result = createVapidAuthHeader({
    endpoint,
    subject: 'mailto:admin@stockflowth.online',
    publicKey,
    privateKey,
    expSeconds,
  });

  assert.equal(result.publicKey, publicKey);
  assert.equal(result.authorization, `vapid t=${result.token}, k=${publicKey}`);

  const parts = result.token.split('.');
  assert.equal(parts.length, 3);

  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(payload, {
    aud: 'https://updates.push.services.mozilla.com',
    exp: expSeconds,
    sub: 'mailto:admin@stockflowth.online',
  });

  const pubBuf = base64UrlDecode(publicKey);
  const publicKeyObj = crypto.createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(pubBuf.subarray(1, 33)),
      y: base64UrlEncode(pubBuf.subarray(33, 65)),
    },
    format: 'jwk',
  });

  const isValid = crypto.verify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
    { key: publicKeyObj, dsaEncoding: 'ieee-p1363' },
    base64UrlDecode(parts[2])
  );
  assert.equal(isValid, true);
});

test('encryptWebPushPayload produces valid RFC 8291 aes128gcm packet decryptable to original JSON', () => {
  const { uaEcdh, uaPublic, authSecret, subscription } = createMockSubscription();
  const originalPayload = {
    id: 'notif-1',
    title: 'Stock Flow',
    body: 'คำขอเบิกวัสดุใหม่รออนุมัติ',
    url: '/withdrawals',
    unreadCount: 3,
  };

  const { ciphertext, salt, localPublicKey } = encryptWebPushPayload(
    JSON.stringify(originalPayload),
    subscription.keys
  );

  assert.equal(salt.length, 16);
  assert.equal(localPublicKey.length, 65);
  assert.equal(localPublicKey[0], 0x04);
  assert.ok(ciphertext.length > 86 + 16);

  const plaintextBuf = decryptAes128GcmPacket(ciphertext, uaEcdh, uaPublic, authSecret);
  assert.deepEqual(JSON.parse(plaintextBuf.toString('utf8')), originalPayload);
});

test('sendWebPushNotification sends encrypted POST and marks 404/410 as gone: true', async () => {
  const vapidKeys = generateVapidKeys();
  const { uaEcdh, uaPublic, authSecret, subscription } = createMockSubscription();
  const payload = { title: 'Test Push', body: 'Hello Stock Flow', url: '/dashboard' };

  let capturedRequest = null;
  const createdRes = await sendWebPushNotification(
    subscription,
    payload,
    vapidKeys,
    async (url, init) => {
      capturedRequest = { url, init };
      return { ok: true, status: 201 };
    }
  );

  assert.deepEqual(createdRes, { ok: true, status: 201, gone: false });
  assert.equal(capturedRequest.url, subscription.endpoint);
  assert.equal(capturedRequest.init.method, 'POST');
  assert.equal(capturedRequest.init.headers['Content-Type'], 'application/octet-stream');
  assert.equal(capturedRequest.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(
    capturedRequest.init.headers['Content-Length'],
    String(capturedRequest.init.body.length)
  );
  assert.equal(capturedRequest.init.headers.TTL, '86400');
  assert.equal(capturedRequest.init.headers.Urgency, 'high');
  assert.match(capturedRequest.init.headers.Authorization, /^vapid t=.+\..+\..+, k=.+$/);

  const decrypted = decryptAes128GcmPacket(
    capturedRequest.init.body,
    uaEcdh,
    uaPublic,
    authSecret
  );
  assert.deepEqual(JSON.parse(decrypted.toString('utf8')), payload);

  const gone410 = await sendWebPushNotification(subscription, payload, vapidKeys, async () => ({
    ok: false,
    status: 410,
  }));
  assert.deepEqual(gone410, { ok: false, status: 410, gone: true });

  const gone404 = await sendWebPushNotification(subscription, payload, vapidKeys, async () => ({
    ok: false,
    status: 404,
  }));
  assert.deepEqual(gone404, { ok: false, status: 404, gone: true });

  const serverErr = await sendWebPushNotification(subscription, payload, vapidKeys, async () => ({
    ok: false,
    status: 500,
  }));
  assert.deepEqual(serverErr, { ok: false, status: 500, gone: false });
});
