import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVapidKeys } from '../webPushCrypto.js';
import {
  createDispatchAwareFetch,
  shouldTriggerWebPushAfterSupabaseRequest,
} from '../supabase.js';
import { dispatchPendingWebPush } from '../../../api/web-push.js';

function createMockSupabaseAdmin({
  notifications = [],
  subscriptions = [],
  vapidKeys = generateVapidKeys(),
  vapidReadError = null,
} = {}) {
  const notifStore = notifications.map((n) => ({ ...n }));
  const subStore = subscriptions.map((s) => ({ ...s }));
  const orderCalls = [];
  const deletedSubIds = [];
  const updatedSubLastUsed = [];
  let claimWasAttemptedBeforeVapidRead = false;
  let vapidReadCompleted = false;

  return {
    state: {
      notifStore,
      subStore,
      orderCalls,
      deletedSubIds,
      updatedSubLastUsed,
      get claimWasAttemptedBeforeVapidRead() {
        return claimWasAttemptedBeforeVapidRead;
      },
    },
    from(table) {
      if (table === 'system_secrets') {
        const filters = {};
        const builder = {
          select() {
            return builder;
          },
          eq(col, val) {
            filters[col] = val;
            return builder;
          },
          async maybeSingle() {
            vapidReadCompleted = true;
            if (vapidReadError) {
              return { data: null, error: { message: vapidReadError } };
            }
            if (filters.key === 'web_push_vapid_keys' && vapidKeys) {
              return { data: { secret_value: JSON.stringify(vapidKeys) }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return builder;
      }

      if (table === 'notifications') {
        let mode = 'select';
        let updatePayload = null;
        let onlyUndispatched = false;
        let onlyUnread = false;
        let inIds = null;
        let inUserIds = null;
        let gteCreatedAt = null;
        let limitCount = null;

        const applyFilters = (rows) => rows.filter((row) => {
          if (onlyUndispatched && row.push_dispatched_at !== null && row.push_dispatched_at !== undefined) {
            return false;
          }
          if (onlyUnread && row.read_at !== null && row.read_at !== undefined) {
            return false;
          }
          if (inIds && !inIds.includes(row.id)) return false;
          if (inUserIds && !inUserIds.includes(row.user_id)) return false;
          if (gteCreatedAt && row.created_at < gteCreatedAt) return false;
          return true;
        });

        const builder = {
          select() {
            return builder;
          },
          update(payload) {
            mode = 'update';
            updatePayload = payload;
            if (!vapidReadCompleted) {
              claimWasAttemptedBeforeVapidRead = true;
            }
            return builder;
          },
          is(col, val) {
            if (col === 'push_dispatched_at' && val === null) onlyUndispatched = true;
            if (col === 'read_at' && val === null) onlyUnread = true;
            return builder;
          },
          in(col, vals) {
            if (col === 'id') inIds = vals;
            if (col === 'user_id') inUserIds = vals;
            return builder;
          },
          gte(col, val) {
            if (col === 'created_at') gteCreatedAt = val;
            return builder;
          },
          order(col, opts) {
            orderCalls.push({ col, opts });
            return builder;
          },
          limit(n) {
            limitCount = n;
            return builder;
          },
          then(resolve, reject) {
            try {
              if (mode === 'update') {
                const matched = applyFilters(notifStore);
                for (const row of matched) {
                  Object.assign(row, updatePayload);
                }
                resolve({ data: matched.map((r) => ({ ...r })), error: null });
                return;
              }

              let rows = applyFilters(notifStore);
              const lastOrder = orderCalls[orderCalls.length - 1];
              if (lastOrder?.col === 'created_at') {
                rows = [...rows].sort((a, b) => {
                  const cmp = String(a.created_at).localeCompare(String(b.created_at));
                  return lastOrder.opts?.ascending === false ? -cmp : cmp;
                });
              }
              if (typeof limitCount === 'number') {
                rows = rows.slice(0, limitCount);
              }
              resolve({ data: rows.map((r) => ({ ...r })), error: null });
            } catch (err) {
              reject(err);
            }
          },
        };
        return builder;
      }

      if (table === 'push_subscriptions') {
        let mode = 'select';
        let updatePayload = null;
        let inUserIds = null;
        let inIds = null;
        let onlyActive = false;

        const builder = {
          select() {
            return builder;
          },
          update(payload) {
            mode = 'update';
            updatePayload = payload;
            return builder;
          },
          delete() {
            mode = 'delete';
            return builder;
          },
          in(col, vals) {
            if (col === 'user_id') inUserIds = vals;
            if (col === 'id') inIds = vals;
            return builder;
          },
          eq(col, val) {
            if (col === 'is_active' && val === true) onlyActive = true;
            return builder;
          },
          then(resolve, reject) {
            try {
              if (mode === 'update') {
                for (const sub of subStore) {
                  if (!inIds || inIds.includes(sub.id)) {
                    Object.assign(sub, updatePayload);
                    updatedSubLastUsed.push(sub.id);
                  }
                }
                resolve({ error: null });
                return;
              }
              if (mode === 'delete') {
                for (let i = subStore.length - 1; i >= 0; i -= 1) {
                  if (!inIds || inIds.includes(subStore[i].id)) {
                    deletedSubIds.push(subStore[i].id);
                    subStore.splice(i, 1);
                  }
                }
                resolve({ error: null });
                return;
              }
              const rows = subStore.filter((sub) => {
                if (inUserIds && !inUserIds.includes(sub.user_id)) return false;
                if (onlyActive && !sub.is_active) return false;
                return true;
              });
              resolve({ data: rows.map((r) => ({ ...r })), error: null });
            } catch (err) {
              reject(err);
            }
          },
        };
        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

test('shouldTriggerWebPushAfterSupabaseRequest matches mutating RPCs and source tables only', () => {
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/rpc/submit_checkout_order', {
      method: 'POST',
    }),
    true
  );
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/withdrawal_orders?select=*', {
      method: 'PATCH',
    }),
    true
  );
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/rpc/get_dashboard_stats', {
      method: 'POST',
    }),
    false
  );
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/rpc/upsert_push_subscription', {
      method: 'POST',
    }),
    false
  );
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/notifications?id=eq.1', {
      method: 'PATCH',
    }),
    false
  );
  assert.equal(
    shouldTriggerWebPushAfterSupabaseRequest('https://proj.supabase.co/rest/v1/withdrawal_orders?select=*', {
      method: 'GET',
    }),
    false
  );

  if (typeof Request === 'function') {
    const req = new Request('https://proj.supabase.co/rest/v1/rpc/process_stock_in', { method: 'POST' });
    assert.equal(shouldTriggerWebPushAfterSupabaseRequest(req), true);
  }
});

test('createDispatchAwareFetch triggers callback only on ok notification-producing mutations', async () => {
  let triggered = 0;
  const okMutationFetch = createDispatchAwareFetch({
    baseFetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    onMutationSuccess: () => {
      triggered += 1;
    },
  });

  await okMutationFetch('https://proj.supabase.co/rest/v1/rpc/approve_withdrawal', { method: 'POST' });
  await Promise.resolve();
  assert.equal(triggered, 1);

  await okMutationFetch('https://proj.supabase.co/rest/v1/withdrawal_orders?select=*', { method: 'GET' });
  await Promise.resolve();
  assert.equal(triggered, 1);

  const failedMutationFetch = createDispatchAwareFetch({
    baseFetch: async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 }),
    onMutationSuccess: () => {
      triggered += 1;
    },
  });

  await failedMutationFetch('https://proj.supabase.co/rest/v1/rpc/approve_withdrawal', { method: 'POST' });
  await Promise.resolve();
  assert.equal(triggered, 1);
});

function withClearedVapidEnv(fn) {
  const prevPublic = process.env.VAPID_PUBLIC_KEY;
  const prevVitePublic = process.env.VITE_VAPID_PUBLIC_KEY;
  const prevPrivate = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VITE_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevPublic !== undefined) process.env.VAPID_PUBLIC_KEY = prevPublic;
      else delete process.env.VAPID_PUBLIC_KEY;
      if (prevVitePublic !== undefined) process.env.VITE_VAPID_PUBLIC_KEY = prevVitePublic;
      else delete process.env.VITE_VAPID_PUBLIC_KEY;
      if (prevPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = prevPrivate;
      else delete process.env.VAPID_PRIVATE_KEY;
    });
}

test('dispatchPendingWebPush orders newest-first, validates VAPID before claim, and cleans 410 subscriptions', () => withClearedVapidEnv(async () => {
  const now = new Date();
  const older = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const newer = new Date(now.getTime() - 60 * 1000).toISOString();

  const mockAdmin = createMockSupabaseAdmin({
    notifications: [
      {
        id: 'notif-old',
        user_id: 'admin-1',
        event_type: 'checkout.pending',
        title: 'Old request',
        message: 'CHK-0001',
        target_path: '/checkouts',
        reference_id: 'ref-1',
        read_at: null,
        push_dispatched_at: null,
        created_at: older,
      },
      {
        id: 'notif-new',
        user_id: 'admin-1',
        event_type: 'withdrawal.submitted',
        title: 'New withdrawal',
        message: 'WO-0002',
        target_path: '/withdrawals',
        reference_id: 'ref-2',
        read_at: null,
        push_dispatched_at: null,
        created_at: newer,
      },
    ],
    subscriptions: [
      {
        id: 'sub-live',
        user_id: 'admin-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/live',
        p256dh: 'p256dh-live',
        auth: 'auth-live',
        is_active: true,
      },
      {
        id: 'sub-gone',
        user_id: 'admin-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/gone',
        p256dh: 'p256dh-gone',
        auth: 'auth-gone',
        is_active: true,
      },
      {
        id: 'sub-temp-err',
        user_id: 'admin-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/err502',
        p256dh: 'p256dh-err',
        auth: 'auth-err',
        is_active: true,
      },
    ],
  });

  const deliveredPayloads = [];
  const summary = await dispatchPendingWebPush(mockAdmin, {
    sendNotification: async (sub, payload) => {
      deliveredPayloads.push({ endpoint: sub.endpoint, id: payload.id, unreadCount: payload.unreadCount });
      if (sub.endpoint.endsWith('/live')) return { ok: true, status: 201, gone: false };
      if (sub.endpoint.endsWith('/gone')) return { ok: false, status: 410, gone: true };
      return { ok: false, status: 502, gone: false };
    },
  });

  assert.equal(summary.dispatchedNotifications, 2);
  assert.equal(summary.sentCount, 2);
  assert.equal(summary.removedGoneCount, 1);
  assert.equal(mockAdmin.state.claimWasAttemptedBeforeVapidRead, false);
  assert.deepEqual(mockAdmin.state.orderCalls[0], { col: 'created_at', opts: { ascending: false } });
  assert.deepEqual(mockAdmin.state.deletedSubIds, ['sub-gone']);
  assert.ok(mockAdmin.state.updatedSubLastUsed.includes('sub-live'));
  assert.equal(deliveredPayloads.length, 6);
  assert.equal(deliveredPayloads[0].unreadCount, 2);
  assert.ok(mockAdmin.state.notifStore.every((n) => Boolean(n.push_dispatched_at)));
}));

test('dispatchPendingWebPush does not claim notifications when VAPID resolution fails', () => withClearedVapidEnv(async () => {
  const mockAdmin = createMockSupabaseAdmin({
    notifications: [
      {
        id: 'notif-1',
        user_id: 'admin-1',
        event_type: 'checkout.pending',
        title: 'Pending',
        message: 'CHK-0009',
        target_path: '/checkouts',
        reference_id: 'ref-9',
        read_at: null,
        push_dispatched_at: null,
        created_at: new Date().toISOString(),
      },
    ],
    vapidReadError: 'system_secrets unavailable',
  });

  await assert.rejects(
    () => dispatchPendingWebPush(mockAdmin, { sendNotification: async () => ({ ok: true, status: 201, gone: false }) }),
    /system_secrets unavailable/
  );
  assert.equal(mockAdmin.state.notifStore[0].push_dispatched_at, null);
}));
