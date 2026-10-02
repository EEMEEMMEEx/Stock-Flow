/**
 * Vercel Cron: daily checkout return reminders.
 * ---------------------------------------------------------------------------
 * Sends two scheduled notification events for the /checkouts module:
 *   - checkout_due_soon : expected_return_date is TOMORROW (Asia/Bangkok)
 *   - checkout_overdue  : expected_return_date is in the past and equipment is
 *                         not fully returned
 *
 * Anti-duplicate guarantee:
 *   Each recipient's dispatch is CLAIMED in public.email_dispatch_logs
 *   (UNIQUE order_id + event_type + dispatched_date + recipient_email) BEFORE
 *   the email is sent. Concurrent or repeated runs therefore cannot send the
 *   same reminder twice; a failed send deletes its claim so the next run may
 *   retry.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Manual runs may
 * instead use the existing internal service secret (`x-internal-secret`).
 */

import { createClient } from '@supabase/supabase-js';
import {
  renderEmailHtml,
  renderEmailText,
  resolveEmailVariables,
  formatThaiDateOrDateTime,
  buildCheckoutEmailItems,
} from '../src/lib/emailRenderer.js';

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const EVENT_DUE_SOON = 'checkout_due_soon';
const EVENT_OVERDUE = 'checkout_overdue';

const SMALL_EVENT_DEFAULTS = {
  [EVENT_DUE_SOON]: {
    subject: '[StockFlow] แจ้งเตือน: อุปกรณ์ตามคำขอยืม {{request_no}} ใกล้ถึงกำหนดส่งคืน',
    status: 'ใกล้ถึงกำหนดส่งคืน',
    fulfillmentStatus: 'อยู่ระหว่างการยืม',
  },
  [EVENT_OVERDUE]: {
    subject: '[StockFlow] ด่วน: รายการยืมอุปกรณ์ {{request_no}} เกินกำหนดส่งคืน (เลยกำหนด {{days_overdue}})',
    status: 'เกินกำหนดส่งคืน',
    fulfillmentStatus: 'เกินกำหนดส่งคืน',
  },
};

/** 'YYYY-MM-DD' for "today" in Asia/Bangkok. */
const bangkokDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Add whole days to a 'YYYY-MM-DD' string without timezone drift. */
const addDays = (dateString, days) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const base = Date.UTC(year, month - 1, day) + days * 86400000;
  return new Date(base).toISOString().slice(0, 10);
};

const diffInDays = (fromDateString, toDateString) => {
  const [fy, fm, fd] = String(fromDateString).split('-').map(Number);
  const [ty, tm, td] = String(toDateString).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

const chunk = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_SERVICE_KEY;
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const internalSecret = req.headers?.['x-internal-secret'] || '';
  const providedSecret = bearer || internalSecret;

  if (!cronSecret) {
    console.error('[checkouts-cron] No CRON_SECRET / INTERNAL_SERVICE_KEY configured — refusing to run.');
    return res.status(401).json({ success: false, message: 'Unauthorized: cron secret is not configured.' });
  }

  if (providedSecret !== cronSecret) {
    return res.status(401).json({ success: false, message: 'Unauthorized: invalid cron secret.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ success: false, message: 'Server configuration error: Supabase credentials missing.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const baseUrl = String(
    process.env.PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || req.headers?.origin
    || 'https://stockflowth.online'
  ).replace(/\/+$/, '');

  const today = bangkokDateString();
  const tomorrow = addDays(today, 1);
  const summary = { date: today, dueSoon: 0, overdue: 0, skipped: 0, failed: 0 };

  try {
    // 1. Notification settings + branding (single source with the client dispatcher)
    const { data: settingsRows } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', ['notification_events', 'branding']);

    const settingsMap = {};
    (settingsRows || []).forEach((row) => { settingsMap[row.key] = row.value; });
    const notificationEvents = settingsMap.notification_events || {};
    const branding = settingsMap.branding || {};

    // 2. Collect candidate orders
    const { data: dueSoonOrders, error: dueSoonError } = await supabaseAdmin
      .from('checkout_orders')
      .select('*')
      .eq('status', 'active')
      .eq('expected_return_date', tomorrow);

    if (dueSoonError) throw dueSoonError;

    const { data: overdueOrders, error: overdueError } = await supabaseAdmin
      .from('checkout_orders')
      .select('*')
      .in('status', ['active', 'partial_returned', 'overdue'])
      .lt('expected_return_date', today)
      .not('expected_return_date', 'is', null);

    if (overdueError) throw overdueError;

    const work = [
      ...(dueSoonOrders || []).map((order) => ({ order, eventType: EVENT_DUE_SOON })),
      ...(overdueOrders || []).map((order) => ({ order, eventType: EVENT_OVERDUE })),
    ];

    if (!work.length) {
      return res.status(200).json({ success: true, ...summary, message: 'No checkout reminders due today.' });
    }

    // 3. Resolve borrowers + projects + items in batches
    const borrowerIds = [...new Set(work.map(({ order }) => order.borrower_id).filter(Boolean))];
    const projectIds = [...new Set(work.map(({ order }) => order.project_id).filter(Boolean))];
    const orderIds = work.map(({ order }) => order.id);

    // Emails live only in auth.users, so they are resolved through the guarded
    // get_user_emails RPC (the service-role client satisfies its auth check).
    const borrowerEmails = new Map();
    for (const ids of chunk(borrowerIds, 100)) {
      const { data: emailRows, error: emailError } = await supabaseAdmin.rpc('get_user_emails', { p_user_ids: ids });
      if (emailError) {
        console.warn('[checkouts-cron] Email lookup failed:', emailError.message);
        continue;
      }
      (emailRows || []).forEach((row) => {
        if (row.email) borrowerEmails.set(row.user_id, row.email);
      });
    }

    const projectById = new Map();
    for (const ids of chunk(projectIds, 50)) {
      const { data: projects } = await supabaseAdmin
        .from('projects')
        .select('id, name, project_code')
        .in('id', ids);
      (projects || []).forEach((project) => projectById.set(project.id, project));
    }

    const itemsByOrder = new Map();
    for (const ids of chunk(orderIds, 50)) {
      const { data: items } = await supabaseAdmin
        .from('checkout_items')
        .select('id, checkout_order_id, quantity_borrowed, quantity_returned, serial_number, items:item_id (id, name, sku, unit)')
        .in('checkout_order_id', ids);
      (items || []).forEach((item) => {
        const list = itemsByOrder.get(item.checkout_order_id) || [];
        list.push(item);
        itemsByOrder.set(item.checkout_order_id, list);
      });
    }

    // 4. Dispatch each order/event pair independently
    for (const { order, eventType } of work) {
      try {
        const result = await dispatchOne({
          supabaseAdmin,
          order,
          eventType,
          today,
          tomorrow,
          baseUrl,
          branding,
          notificationEvents,
          borrowerEmails,
          projectById,
          itemsByOrder,
        });

        if (result.dispatched) {
          if (eventType === EVENT_DUE_SOON) summary.dueSoon += 1; else summary.overdue += 1;
        } else if (result.skipped) {
          summary.skipped += 1;
        }
      } catch (orderError) {
        summary.failed += 1;
        console.error(`[checkouts-cron] ${eventType} failed for order ${order.order_number}:`, orderError.message);
      }
    }

    return res.status(200).json({ success: true, ...summary });
  } catch (error) {
    console.error('[checkouts-cron] fatal:', error.message);
    return res.status(500).json({ success: false, ...summary, message: error.message });
  }
}

/**
 * Render + claim + send a single scheduled reminder for one recipient.
 */
async function dispatchOne({
  supabaseAdmin,
  order,
  eventType,
  today,
  baseUrl,
  branding,
  notificationEvents,
  borrowerEmails,
  projectById,
  itemsByOrder,
}) {
  const eventConfig = notificationEvents[eventType] || {};
  if (eventConfig.enabled === false) {
    return { skipped: 'EVENT_DISABLED' };
  }

  const toEmail = borrowerEmails.get(order.borrower_id);
  if (!toEmail) {
    return { skipped: 'NO_VALID_RECIPIENTS' };
  }

  const project = projectById.get(order.project_id) || null;
  const dueDate = formatThaiDateOrDateTime(order.expected_return_date);
  const todayInBangkok = bangkokDateString();
  const overdueDays = diffInDays(order.expected_return_date, todayInBangkok);
  const daysOverdue = overdueDays > 0 ? `${overdueDays} วัน` : '';
  const items = buildCheckoutEmailItems(itemsByOrder.get(order.id) || [], { dueDate });
  const defaults = SMALL_EVENT_DEFAULTS[eventType];
  const checkoutId = order.order_number;
  const totalQty = items.reduce((sum, item) => sum + (Number(item.requested_qty) || 0), 0);
  const unitLabel = items[0]?.unit || 'ชิ้น';
  const basePublicUrl = String(branding.public_base_url || baseUrl).replace(/\/+$/, '');
  const actionUrl = `${basePublicUrl}/checkouts?order_id=${encodeURIComponent(checkoutId)}`;

  const emailData = {
    event_type: eventType,
    app_name: branding.app_name || 'StockFlow',
    checkout_id: checkoutId,
    request_no: checkoutId,
    borrower_name: order.borrower_name || 'ผู้ขอยืม',
    borrower_department: order.borrower_department || '-',
    borrower_phone: order.borrower_phone || '-',
    requester_name: order.borrower_name || 'ผู้ขอยืม',
    requester_email: toEmail,
    user_name: order.borrower_name || 'ผู้ขอยืม',
    project_name: project?.name || 'โครงการทั่วไป',
    project_code: project?.project_code || '-',
    equipment_name: items[0]?.name || '-',
    asset_code: items[0]?.asset_code || '-',
    quantity: `${totalQty} ${unitLabel}`,
    checkout_date: formatThaiDateOrDateTime(order.checkout_date),
    due_date: dueDate,
    days_overdue: daysOverdue,
    purpose: order.purpose || '-',
    note: order.notes || '',
    public_base_url: basePublicUrl,
    status: defaults.status,
    fulfillment_status: defaults.fulfillmentStatus,
    item_count: `${items.length} รายการ`,
    total_quantity: `${totalQty} ${unitLabel}`,
    action_url: actionUrl,
    items: items.map((item) => ({ ...item, due_date: dueDate })),
  };

  const template = { ...eventConfig, event_type: eventType };
  const html = renderEmailHtml({ branding, template, data: emailData });
  const text = renderEmailText({ branding, template, data: emailData });
  const subject = resolveEmailVariables(eventConfig.subject || defaults.subject, emailData);

  // CC administrators on overdue reminders (opt-in via cc_roles / 'ADMIN' default).
  const ccList = [];
  if (eventType === EVENT_OVERDUE) {
    const ccRoles = eventConfig.cc_roles || ['ADMIN', 'SUPERVISOR'];
    const { data: ccRows } = await supabaseAdmin.rpc('get_user_emails', { p_roles: ccRoles });
    (ccRows || []).forEach((row) => {
      if (row.email && row.email !== toEmail && !ccList.includes(row.email)) ccList.push(row.email);
    });
  }

  // Claim BEFORE sending: the UNIQUE constraint is the idempotency guard.
  const { error: claimError } = await supabaseAdmin
    .from('email_dispatch_logs')
    .insert({
      order_id: order.id,
      event_type: eventType,
      dispatched_date: today,
      recipient_email: toEmail,
    });

  if (claimError) {
    if (claimError.code === '23505') {
      return { skipped: 'ALREADY_DISPATCHED' };
    }
    throw new Error(`claim insert failed: ${claimError.message}`);
  }

  const internalSecret = process.env.INTERNAL_SERVICE_KEY || process.env.CRON_SECRET;
  const response = await fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': internalSecret,
    },
    body: JSON.stringify({
      to: [toEmail],
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text,
      actionUrl,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    // Release the claim so the next run can retry this reminder.
    await supabaseAdmin
      .from('email_dispatch_logs')
      .delete()
      .eq('order_id', order.id)
      .eq('event_type', eventType)
      .eq('dispatched_date', today)
      .eq('recipient_email', toEmail);
    throw new Error(result.message || `send-email responded ${response.status}`);
  }

  return { dispatched: true, recipient: toEmail, ccCount: ccList.length };
}
