import { createClient } from '@supabase/supabase-js';
import { generateVapidKeys, sendWebPushNotification } from '../src/lib/webPushCrypto.js';
import { resolveNotificationTarget } from '../src/lib/notificationTargets.js';

const VAPID_SECRET_KEY = 'web_push_vapid_keys';
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@stockflowth.online';
const DISPATCH_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DISPATCH_BATCH_LIMIT = 30;

function setCorsAndSecurityHeaders(req, res) {
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Internal-Secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  return {
    supabaseUrl,
    serviceRoleKey,
    supabaseKey: serviceRoleKey || anonKey,
  };
}

function createAdminClient(supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createUserClient(supabaseUrl, supabaseKey, token) {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}

async function authenticateRequest(req, { supabaseUrl, supabaseKey }) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const internalSecret = req.headers['x-internal-secret'];

  const hasValidInternalSecret = Boolean(
    internalSecret &&
    process.env.INTERNAL_SERVICE_KEY &&
    internalSecret === process.env.INTERNAL_SERVICE_KEY
  );

  let authUser = null;
  if (token && supabaseUrl && supabaseKey) {
    try {
      const supabaseAuthClient = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const {
        data: { user },
        error: authErr,
      } = await supabaseAuthClient.auth.getUser(token);
      if (!authErr && user) {
        authUser = user;
      }
    } catch (authEx) {
      console.warn('[Web Push API] Auth token verification error:', authEx.message);
    }
  }

  return { token, authUser, hasValidInternalSecret };
}

async function resolveVapidKeys(supabaseAdmin) {
  const envPublic = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT).trim();

  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate, subject };
  }

  if (!supabaseAdmin) {
    throw new Error(
      'VAPID keys are not configured in environment and SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
  }

  const { data: existingRow, error: readErr } = await supabaseAdmin
    .from('system_secrets')
    .select('secret_value')
    .eq('key', VAPID_SECRET_KEY)
    .maybeSingle();

  if (readErr) {
    throw new Error(`Failed to read VAPID keys from system_secrets: ${readErr.message}`);
  }

  if (existingRow?.secret_value) {
    try {
      const parsed = JSON.parse(existingRow.secret_value);
      if (parsed?.publicKey && parsed?.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject };
      }
    } catch {
      // Malformed JSON will be replaced below
    }
  }

  const generated = generateVapidKeys();
  const payload = {
    key: VAPID_SECRET_KEY,
    secret_value: JSON.stringify(generated),
    description: 'Auto-generated Web Push VAPID keypair',
    updated_at: new Date().toISOString(),
  };

  if (existingRow) {
    const { error: updateErr } = await supabaseAdmin
      .from('system_secrets')
      .update(payload)
      .eq('key', VAPID_SECRET_KEY);
    if (updateErr) {
      throw new Error(`Failed to update VAPID keys in system_secrets: ${updateErr.message}`);
    }
  } else {
    const { error: insertErr } = await supabaseAdmin.from('system_secrets').insert(payload);
    if (insertErr) {
      // Handle concurrent first-request insert race safely by re-reading
      const { data: retryRow } = await supabaseAdmin
        .from('system_secrets')
        .select('secret_value')
        .eq('key', VAPID_SECRET_KEY)
        .maybeSingle();
      if (retryRow?.secret_value) {
        const parsed = JSON.parse(retryRow.secret_value);
        if (parsed?.publicKey && parsed?.privateKey) {
          return { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject };
        }
      }
      throw new Error(`Failed to store VAPID keys in system_secrets: ${insertErr.message}`);
    }
  }

  return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function isValidPushEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return false;
  try {
    const parsed = new URL(endpoint);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function handlePublicKey(res, supabaseAdmin) {
  const { publicKey } = await resolveVapidKeys(supabaseAdmin);
  return res.status(200).json({ success: true, publicKey });
}

async function handleSubscribe(req, res, dbClient, authUser, body) {
  if (!authUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
  }

  const { subscription, deviceLabel = null } = body;
  const endpoint = subscription?.endpoint ? String(subscription.endpoint).trim() : '';
  const p256dh = subscription?.keys?.p256dh ? String(subscription.keys.p256dh).trim() : '';
  const auth = subscription?.keys?.auth ? String(subscription.keys.auth).trim() : '';

  if (!isValidPushEndpoint(endpoint) || !p256dh || !auth) {
    return res.status(400).json({
      success: false,
      message: 'Invalid push subscription: endpoint, keys.p256dh, and keys.auth are required.',
    });
  }

  const record = {
    user_id: authUser.id,
    endpoint,
    p256dh,
    auth,
    user_agent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : null,
    device_label: deviceLabel ? String(deviceLabel).trim().slice(0, 120) : null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await dbClient
    .from('push_subscriptions')
    .upsert(record, { onConflict: 'endpoint' })
    .select('id, endpoint, is_active, updated_at')
    .single();

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  return res.status(200).json({ success: true, subscription: data });
}

async function handleUnsubscribe(res, dbClient, authUser, body) {
  if (!authUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
  }

  const endpoint = body?.endpoint ? String(body.endpoint).trim() : '';
  if (!endpoint) {
    return res.status(400).json({ success: false, message: 'endpoint is required.' });
  }

  const { error } = await dbClient
    .from('push_subscriptions')
    .delete()
    .eq('user_id', authUser.id)
    .eq('endpoint', endpoint);

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  return res.status(200).json({ success: true });
}

async function syncSubscriptionLifecycle(dbClient, succeededIds, goneIds) {
  if (succeededIds.length > 0) {
    try {
      await dbClient
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', succeededIds);
    } catch (err) {
      console.warn('[Web Push API] Failed to update last_used_at:', err.message);
    }
  }

  if (goneIds.length > 0) {
    try {
      await dbClient
        .from('push_subscriptions')
        .delete()
        .in('id', goneIds);
    } catch (err) {
      console.warn('[Web Push API] Failed to delete gone subscriptions:', err.message);
    }
  }
}

async function sendToSubscriptions(dbClient, subscriptions, payload, vapidKeys) {
  let sentCount = 0;
  const succeededIds = [];
  const goneIds = [];

  for (const sub of subscriptions) {
    try {
      const result = await sendWebPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        vapidKeys
      );
      if (result.ok) {
        sentCount += 1;
        succeededIds.push(sub.id);
      } else if (result.gone) {
        goneIds.push(sub.id);
      }
    } catch (err) {
      console.warn('[Web Push API] Delivery attempt failed:', err.message);
    }
  }

  await syncSubscriptionLifecycle(dbClient, succeededIds, goneIds);

  return { sentCount, goneIds };
}

async function handleTest(res, dbClient, supabaseAdmin, authUser) {
  if (!authUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
  }

  const { data: subscriptions, error: fetchErr } = await dbClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', authUser.id)
    .eq('is_active', true);

  if (fetchErr) {
    return res.status(500).json({ success: false, message: fetchErr.message });
  }

  const activeSubs = subscriptions || [];
  if (activeSubs.length === 0) {
    return res.status(200).json({ success: true, sentCount: 0, totalSubscriptions: 0 });
  }

  const vapidKeys = await resolveVapidKeys(supabaseAdmin);
  const testPayload = {
    id: null,
    title: 'Stock Flow',
    body: 'การแจ้งเตือนแบบ Push พร้อมใช้งานบนอุปกรณ์นี้แล้ว',
    url: '/dashboard',
    event_type: 'web_push.test',
    tag: 'stockflow-push-test',
  };

  const { sentCount } = await sendToSubscriptions(dbClient, activeSubs, testPayload, vapidKeys);

  return res.status(200).json({
    success: true,
    sentCount,
    totalSubscriptions: activeSubs.length,
  });
}

async function handleDispatchPending(res, supabaseAdmin, authUser, hasValidInternalSecret) {
  if (!authUser && !hasValidInternalSecret) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Bearer token or X-Internal-Secret required.',
    });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for dispatch-pending.',
    });
  }

  const cutoffIso = new Date(Date.now() - DISPATCH_LOOKBACK_MS).toISOString();
  const { data: candidates, error: queryErr } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .is('push_dispatched_at', null)
    .is('read_at', null)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(DISPATCH_BATCH_LIMIT);

  if (queryErr) {
    return res.status(500).json({ success: false, message: queryErr.message });
  }

  if (!candidates || candidates.length === 0) {
    return res.status(200).json({
      success: true,
      dispatchedNotifications: 0,
      sentCount: 0,
      removedGoneCount: 0,
    });
  }

  const candidateIds = candidates.map((row) => row.id);
  const nowIso = new Date().toISOString();

  // Atomically claim undispatched rows so concurrent callers never double-push
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('notifications')
    .update({ push_dispatched_at: nowIso })
    .in('id', candidateIds)
    .is('push_dispatched_at', null)
    .select('id, user_id, event_type, title, message, target_path, reference_id, metadata');

  if (claimErr) {
    return res.status(500).json({ success: false, message: claimErr.message });
  }

  if (!claimed || claimed.length === 0) {
    return res.status(200).json({
      success: true,
      dispatchedNotifications: 0,
      sentCount: 0,
      removedGoneCount: 0,
    });
  }

  const userIds = [...new Set(claimed.map((n) => n.user_id).filter(Boolean))];
  if (userIds.length === 0) {
    return res.status(200).json({
      success: true,
      dispatchedNotifications: claimed.length,
      sentCount: 0,
      removedGoneCount: 0,
    });
  }

  const [{ data: subscriptions, error: subsErr }, { data: unreadRows }, vapidKeys] =
    await Promise.all([
      supabaseAdmin
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIds)
        .eq('is_active', true),
      supabaseAdmin
        .from('notifications')
        .select('user_id')
        .in('user_id', userIds)
        .is('read_at', null),
      resolveVapidKeys(supabaseAdmin),
    ]);

  if (subsErr) {
    return res.status(500).json({ success: false, message: subsErr.message });
  }

  const subsByUser = new Map();
  for (const sub of subscriptions || []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, []);
    subsByUser.get(sub.user_id).push(sub);
  }

  const unreadCountByUser = new Map();
  for (const row of unreadRows || []) {
    unreadCountByUser.set(row.user_id, (unreadCountByUser.get(row.user_id) || 0) + 1);
  }

  let sentCount = 0;
  const succeededSubIds = new Set();
  const goneSubIds = new Set();

  for (const notification of claimed) {
    const userSubs = (subsByUser.get(notification.user_id) || []).filter(
      (sub) => !goneSubIds.has(sub.id)
    );
    if (userSubs.length === 0) continue;

    const url = resolveNotificationTarget(notification) || '/dashboard';
    const payload = {
      id: notification.id,
      title: notification.title,
      body: notification.message,
      message: notification.message,
      url,
      event_type: notification.event_type,
      reference_id: notification.reference_id,
      unreadCount: unreadCountByUser.get(notification.user_id) ?? undefined,
    };

    for (const sub of userSubs) {
      try {
        const result = await sendWebPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          vapidKeys
        );
        if (result.ok) {
          sentCount += 1;
          succeededSubIds.add(sub.id);
        } else if (result.gone) {
          goneSubIds.add(sub.id);
        }
      } catch (err) {
        console.warn('[Web Push API] Dispatch send failed:', err.message);
      }
    }
  }

  await syncSubscriptionLifecycle(supabaseAdmin, [...succeededSubIds], [...goneSubIds]);

  return res.status(200).json({
    success: true,
    dispatchedNotifications: claimed.length,
    sentCount,
    removedGoneCount: goneSubIds.size,
  });
}

export default async function handler(req, res) {
  setCorsAndSecurityHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const config = getSupabaseConfig();
    const supabaseAdmin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);

    if (req.method === 'GET') {
      return await handlePublicKey(res, supabaseAdmin);
    }

    const body = parseBody(req);
    const action = body?.action;

    if (action === 'public-key') {
      return await handlePublicKey(res, supabaseAdmin);
    }

    const { token, authUser, hasValidInternalSecret } = await authenticateRequest(req, config);
    const dbClient = supabaseAdmin || createUserClient(config.supabaseUrl, config.supabaseKey, token);

    switch (action) {
      case 'subscribe':
        if (!authUser) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
        }
        if (!dbClient) {
          return res.status(500).json({ success: false, message: 'Server configuration error: Supabase credentials not configured.' });
        }
        return await handleSubscribe(req, res, dbClient, authUser, body);
      case 'unsubscribe':
        if (!authUser) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
        }
        if (!dbClient) {
          return res.status(500).json({ success: false, message: 'Server configuration error: Supabase credentials not configured.' });
        }
        return await handleUnsubscribe(res, dbClient, authUser, body);
      case 'test':
        if (!authUser) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Valid session required.' });
        }
        if (!dbClient) {
          return res.status(500).json({ success: false, message: 'Server configuration error: Supabase credentials not configured.' });
        }
        return await handleTest(res, dbClient, supabaseAdmin, authUser);
      case 'dispatch-pending':
        return await handleDispatchPending(res, supabaseAdmin, authUser, hasValidInternalSecret);
      default:
        return res.status(400).json({
          success: false,
          message: `Unknown action: ${String(action || '')}`,
        });
    }
  } catch (error) {
    console.error('[Web Push API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Web Push API request failed',
    });
  }
}
