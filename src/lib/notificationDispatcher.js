import { supabase } from './supabase';
import {
  renderEmailHtml,
  renderEmailText,
  formatThaiDateTime,
  formatThaiDateOrDateTime,
  formatReturnCondition,
  resolveEmailVariables,
  buildCheckoutEmailItems,
} from './emailRenderer';
import { sendStockFlowEmail } from './emailService';
import { EMAIL_REGEX, isValidEmail, parseEmailList, mergeNotificationSettings } from './emailSettings';

const dispatchedEventsCache = new Set();

/**
 * Read `notification_events` + `branding` for the notification dispatchers.
 *
 * The admin_get_system_settings RPC is guarded by `has_permission(uid,
 * 'settings.view')`, which only ADMIN/SUPER hold — so a STAFF or SUPERVISOR
 * action always received an empty settings object and the dispatcher lost every
 * role, to_extra and enabled flag. system_settings is readable by any
 * authenticated user through the "Authenticated Read Settings" RLS policy, so we
 * read the table directly and keep the RPC only as a fallback.
 */
const fetchNotificationSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['notification_events', 'branding']);

    if (error) {
      console.warn(
        '[NotificationDispatcher] Direct settings read failed:',
        `code=${error.code}`,
        `message=${error.message}`
      );
    } else if (data?.length) {
      return mergeNotificationSettings(data);
    }
  } catch (err) {
    console.warn('[NotificationDispatcher] Direct settings read threw:', err?.message);
  }

  // Fallback for deployments where the direct read is not permitted.
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_system_settings');
  if (rpcError) {
    console.warn('[NotificationDispatcher] Settings fallback RPC failed:', rpcError.message);
    return { notificationEvents: {}, branding: {} };
  }
  return mergeNotificationSettings(rpcData);
};

/**
 * Resolve {{variable}} placeholders in a subject line using the same resolver as
 * the HTML/text body, so every advertised variable works in the subject too.
 */
const resolveSubject = (subjectTemplate, fallbackSubject, emailData) => (
  subjectTemplate
    ? resolveEmailVariables(subjectTemplate, emailData).trim()
    : fallbackSubject
);

/**
 * Resolve display names for the persisted actor ids on a withdrawal order.
 * withdrawal_orders has approved_by/rejected_by/completed_by UUIDs but no
 * *_by_name columns, so the previous code always fell back to a generic label.
 */
const resolveActorNames = async (order) => {
  const ids = [...new Set([order?.approved_by, order?.rejected_by, order?.completed_by].filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  if (error) {
    console.warn('[NotificationDispatcher] Actor profile lookup failed:', error.message);
    return {};
  }

  const byId = new Map((data || []).map((profile) => [profile.id, profile.full_name]));
  return {
    approvedByName: byId.get(order.approved_by) || '',
    rejectedByName: byId.get(order.rejected_by) || '',
    completedByName: byId.get(order.completed_by) || '',
  };
};

/**
 * Resolve user emails from auth.users through the guarded public.get_user_emails RPC.
 * public.profiles intentionally has NO email column (canonical login emails live only
 * in auth.users.email), so selecting `email` from profiles returns HTTP 400 / 42703.
 */
const resolveUserEmails = async ({ userIds = null, roles = null } = {}) => {
  const cleanIds = (userIds || []).filter(Boolean);
  const cleanRoles = (roles || []).map((r) => String(r || '').trim()).filter(Boolean);
  if (!cleanIds.length && !cleanRoles.length) return [];

  const { data, error } = await supabase.rpc('get_user_emails', {
    p_user_ids: cleanIds.length ? cleanIds : null,
    p_roles: cleanRoles.length ? cleanRoles : null,
  });

  if (error) {
    console.warn(
      '[NotificationDispatcher] Recipient email lookup failed:',
      `code=${error.code}`,
      `message=${error.message}`,
      `details=${error.details}`,
      `hint=${error.hint}`
    );
    return [];
  }
  return data || [];
};

const emailsForRoles = (users, roles) => {
  const wanted = (roles || []).map((r) => String(r || '').toLowerCase());
  return (users || []).filter((u) => u.email && wanted.includes(String(u.role || '').toLowerCase()));
};

/**
 * Dispatches transactional email notifications for withdrawal workflow events.
 */
export const dispatchWithdrawalNotification = async ({
  eventType,
  orderId,
  orderData: preloadedOrder = null,
  approverName = '',
  rejectionReason = ''
}) => {
  if (!eventType || !orderId) {
    return { success: false, reason: 'INVALID_ARGUMENTS' };
  }

  const cacheKey = `${eventType}:${orderId}`;
  if (dispatchedEventsCache.has(cacheKey)) {
    return { success: true, deduplicated: true };
  }

  try {
    // 1. Fetch system settings (notification_events & branding)
    const { notificationEvents, branding } = await fetchNotificationSettings();

    const eventConfig = notificationEvents[eventType];
    if (eventConfig && eventConfig.enabled === false) {
      return { success: true, skipped: 'EVENT_DISABLED' };
    }

    // 2. Fetch full order details if not preloaded
    let order = preloadedOrder;
    if (!order || !order.projects || !order.profiles) {
      const { data: fetchedOrder, error: orderErr } = await supabase
        .from('withdrawal_orders')
        .select(`
          *,
          projects:project_id (id, name, project_code),
          profiles:requested_by (id, full_name, role)
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (orderErr || !fetchedOrder) {
        console.warn('[NotificationDispatcher] Order fetch error:', orderErr?.message);
        return { success: false, reason: 'ORDER_NOT_FOUND' };
      }
      order = fetchedOrder;
    }

    // 3. Fetch withdrawal line items if not attached
    let items = order.items || [];
    if (!items.length) {
      const { data: fetchedItems } = await supabase
        .from('withdrawal_items')
        .select(`
          id, quantity, delivery_to, serial_number, part_number,
          item:item_id (id, name, sku, unit, quantity)
        `)
        .eq('order_id', orderId);

      if (fetchedItems?.length) {
        items = fetchedItems.map(wi => ({
          name: wi.item?.name || 'วัสดุ',
          sku: wi.item?.sku || wi.part_number || '-',
          unit: wi.item?.unit || 'หน่วย',
          requested_qty: wi.quantity,
          approved_qty: wi.quantity,
          available_stock: wi.item?.quantity ?? 0
        }));
      }
    }

    // 4. Resolve recipient emails (auth.users via RPC; profiles has no email column)
    const targetRoles = eventConfig?.roles || [];
    const recipientEmails = new Set();

    const adminRoles = targetRoles.filter(r => r !== 'STAFF');
    const actorRoles = adminRoles.length > 0 ? adminRoles : ['ADMIN', 'SUPERVISOR', 'SUPER'];
    const resolvedUsers = await resolveUserEmails({
      userIds: order.requested_by ? [order.requested_by] : null,
      roles: actorRoles
    });
    const requesterEmail = resolvedUsers.find(u => u.user_id === order.requested_by)?.email || '';

    // Include the requester when the event is addressed to them: either the
    // event targets STAFF, or it is a status outcome of their own request.
    // `withdrawal_completed` used to be missing here, so the requester never
    // received the "materials issued" confirmation.
    const requesterDirected = [
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed',
    ].includes(eventType);
    if (requesterEmail && (targetRoles.includes('STAFF') || requesterDirected)) {
      recipientEmails.add(requesterEmail.trim());
    }

    // Include role-based recipients (e.g. ADMIN, SUPERVISOR)
    if (adminRoles.length > 0) {
      emailsForRoles(resolvedUsers, adminRoles).forEach(u => {
        if (u.email) recipientEmails.add(u.email.trim());
      });
    }

    // Include explicit extra recipients from the template settings
    parseEmailList(eventConfig?.to_extra).forEach(e => recipientEmails.add(e));

    const validRecipients = [...recipientEmails].filter(isValidEmail);

    if (!validRecipients.length) {
      return { success: true, skipped: 'NO_VALID_RECIPIENTS' };
    }

    // Actor display names come from profiles: withdrawal_orders stores only the
    // *_by UUIDs (there are no approved_by_name / rejected_by_name columns).
    const actorNames = await resolveActorNames(order);

    // 5. Build template data payload
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.requested_qty) || 0), 0);
    const workOrderNo = order.work_order_no || order.order_no || order.request_no
      || `WO-${order.id?.slice(0, 8).toUpperCase()}`;
    const emailData = {
      event_type: eventType,
      app_name: branding.app_name || 'StockFlow',
      user_name: order.profiles?.full_name || requesterEmail || 'ผู้ขอเบิก',
      requester_name: order.profiles?.full_name || requesterEmail || 'ผู้ขอเบิก',
      requester_email: requesterEmail || '',
      request_no: workOrderNo,
      project_name: order.projects?.name || 'โครงการทั่วไป',
      project_code: order.projects?.project_code || '-',
      request_date: formatThaiDateTime(order.created_at || order.requested_at),
      approved_date: formatThaiDateTime(order.approved_at || new Date().toISOString()),
      rejected_date: formatThaiDateTime(order.rejected_at || new Date().toISOString()),
      completed_date: formatThaiDateTime(order.completed_at || new Date().toISOString()),
      status: eventType === 'withdrawal_approved' ? 'อนุมัติแล้ว' : (eventType === 'withdrawal_rejected' ? 'ไม่ได้รับการอนุมัติ' : (eventType === 'withdrawal_completed' ? 'จ่ายวัสดุแล้ว' : 'รออนุมัติ')),
      fulfillment_status: order.fulfillment_status || order.status || 'รอพิจารณา',
      item_count: `${items.length} รายการ`,
      total_quantity: `${totalQuantity} หน่วย`,
      purpose: order.purpose || order.notes || '-',
      note: order.notes || '',
      approved_by: approverName || actorNames.approvedByName || 'ผู้อนุมัติ',
      rejected_by: approverName || actorNames.rejectedByName || 'ผู้ปฏิเสธ',
      completed_by: approverName || actorNames.completedByName || 'ผู้จ่ายวัสดุ',
      rejection_reason: rejectionReason || order.rejection_reason || order.reject_reason || '',
      action_url: branding.public_base_url || 'https://stockflowth.online/withdrawals',
      items
    };

    const html = renderEmailHtml({
      branding,
      template: eventConfig || {},
      data: emailData
    });

    const plainText = `[${emailData.app_name}] แจ้งเตือนรายการคำขอเบิก ${emailData.request_no}\nโครงการ: ${emailData.project_name}\nผู้ขอเบิก: ${emailData.requester_name}\nสถานะ: ${emailData.status}\nจำนวน: ${emailData.item_count}\nเปิดดูรายละเอียด: ${emailData.action_url}`;

    const subject = resolveSubject(
      eventConfig?.subject,
      `[${emailData.app_name}] ${eventType === 'withdrawal_rejected' ? `คำขอเบิก ${emailData.request_no} ไม่ได้รับการอนุมัติ` : `แจ้งเตือนคำขอเบิก ${emailData.request_no}`} (${emailData.project_name})`,
      emailData
    );

    // 6. Send transactional email
    const ccList = parseEmailList(eventConfig?.cc_extra, { exclude: validRecipients });

    await sendStockFlowEmail({
      to: validRecipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text: plainText,
      actionUrl: emailData.action_url
    });

    dispatchedEventsCache.add(cacheKey);
    return { success: true, dispatched: true, recipientCount: validRecipients.length, ccCount: ccList.length };
  } catch (err) {
    console.error('[NotificationDispatcher] dispatchWithdrawalNotification error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Dispatches transactional email notifications when stock-in is recorded.
 */
export const dispatchStockInNotification = async ({
  orderId,
  projectId,
  items: preloadedItems = [],
  receivedBy = '',
  supplier = '',
  poNumber = ''
}) => {
  const cacheKey = `stock_in_created:${orderId || projectId}:${Date.now()}`;
  try {
    const { notificationEvents, branding } = await fetchNotificationSettings();

    const eventConfig = notificationEvents['stock_in_created'];
    if (eventConfig && eventConfig.enabled === false) {
      return { success: true, skipped: 'EVENT_DISABLED' };
    }

    let project = null;
    if (projectId) {
      const { data: projData } = await supabase
        .from('projects')
        .select('id, name, project_code, location')
        .eq('id', projectId)
        .maybeSingle();
      project = projData;
    }

    let lineItems = preloadedItems;
    if (!lineItems.length && orderId) {
      const { data: fetchedItems } = await supabase
        .from('stock_in_items')
        .select('*, items!item_id(name, model, unit, sku)')
        .eq('order_id', orderId);
      if (fetchedItems?.length) {
        lineItems = fetchedItems.map(si => ({
          name: si.items?.name || si.name || 'วัสดุ',
          sku: si.items?.sku || si.sku || '-',
          unit: si.items?.unit || 'หน่วย',
          quantity: si.quantity,
          available_stock: si.quantity
        }));
      }
    }

    const targetRoles = eventConfig?.roles || ['ADMIN', 'SUPERVISOR'];
    const recipientEmails = new Set();

    if (targetRoles.length > 0) {
      const roleUsers = await resolveUserEmails({ roles: targetRoles });
      roleUsers.forEach(u => {
        if (u.email) recipientEmails.add(u.email.trim());
      });
    }

    parseEmailList(eventConfig?.to_extra).forEach(e => recipientEmails.add(e));

    const validRecipients = [...recipientEmails].filter(isValidEmail);

    if (!validRecipients.length) {
      return { success: true, skipped: 'NO_VALID_RECIPIENTS' };
    }

    const stockInNo = orderId ? `SI-${String(orderId).slice(0, 8).toUpperCase()}` : `SI-${Date.now().toString().slice(-6)}`;
    const totalQuantity = lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const emailData = {
      event_type: 'stock_in_created',
      app_name: branding.app_name || 'StockFlow',
      stock_in_no: stockInNo,
      project_name: project?.name || 'โครงการทั่วไป',
      project_code: project?.project_code || '-',
      received_by: receivedBy || 'Warehouse Admin',
      received_date: formatThaiDateTime(new Date().toISOString()),
      supplier_name: supplier || '-',
      po_number: poNumber || '-',
      status: 'รับเข้า Stock แล้ว',
      status_badge: 'รับเข้า Stock',
      item_count: `${lineItems.length} รายการ`,
      total_quantity: `${totalQuantity} หน่วย`,
      action_url: branding.public_base_url ? `${branding.public_base_url}/stock-in` : 'https://stockflowth.online/stock-in',
      items: lineItems
    };

    const html = renderEmailHtml({
      branding,
      template: eventConfig || {},
      data: emailData
    });

    const plainText = `[${emailData.app_name}] มีการรับวัสดุเข้าสต็อกเรียบร้อยแล้ว\nเลขที่รับเข้า: ${emailData.stock_in_no}\nโครงการ: ${emailData.project_name}\nผู้รับเข้า: ${emailData.received_by}\nจำนวน: ${emailData.item_count} (${emailData.total_quantity})\nเปิดดูรายการ: ${emailData.action_url}`;

    const subject = resolveSubject(
      eventConfig?.subject,
      `[${emailData.app_name}] รับเข้า Stock ${emailData.stock_in_no} — ${emailData.project_name}`,
      emailData
    );

    const ccList = parseEmailList(eventConfig?.cc_extra, { exclude: validRecipients });

    await sendStockFlowEmail({
      to: validRecipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text: plainText,
      actionUrl: emailData.action_url
    });

    dispatchedEventsCache.add(cacheKey);
    return { success: true, dispatched: true, recipientCount: validRecipients.length, ccCount: ccList.length };
  } catch (err) {
    console.error('[NotificationDispatcher] dispatchStockInNotification error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Dispatches transactional email notifications when an item stock drops below threshold.
 */
export const dispatchLowStockAlertNotification = async ({
  itemId,
  itemName,
  itemCode,
  currentStock,
  threshold,
  projectName,
  warehouseName,
  projectId
}) => {
  const cacheKey = `low_stock_alert:${itemId || itemName}:${projectId || 'all'}`;
  if (dispatchedEventsCache.has(cacheKey)) {
    return { success: true, deduplicated: true };
  }

  try {
    const { notificationEvents, branding } = await fetchNotificationSettings();

    const eventConfig = notificationEvents['low_stock_alert'];
    if (eventConfig && eventConfig.enabled === false) {
      return { success: true, skipped: 'EVENT_DISABLED' };
    }

    const targetRoles = eventConfig?.roles || ['ADMIN', 'SUPERVISOR'];
    const recipientEmails = new Set();

    if (targetRoles.length > 0) {
      const roleUsers = await resolveUserEmails({ roles: targetRoles });
      roleUsers.forEach(u => {
        if (u.email) recipientEmails.add(u.email.trim());
      });
    }

    parseEmailList(eventConfig?.to_extra).forEach(e => recipientEmails.add(e));

    const validRecipients = [...recipientEmails].filter(isValidEmail);

    if (!validRecipients.length) {
      return { success: true, skipped: 'NO_VALID_RECIPIENTS' };
    }

    const emailData = {
      event_type: 'low_stock_alert',
      app_name: branding.app_name || 'StockFlow',
      item_name: itemName || 'วัสดุ',
      item_code: itemCode || '-',
      project_name: projectName || 'คลังส่วนกลาง',
      project_code: '-',
      warehouse_name: warehouseName || 'คลังหลัก',
      current_stock: `${currentStock ?? 0} หน่วย`,
      threshold: `${threshold ?? 10} หน่วย`,
      status: 'ต่ำกว่าเกณฑ์',
      status_badge: 'Stock ต่ำกว่าเกณฑ์',
      action_url: branding.public_base_url ? `${branding.public_base_url}/items` : 'https://stockflowth.online/items',
      items: []
    };

    const html = renderEmailHtml({
      branding,
      template: eventConfig || {},
      data: emailData
    });

    const plainText = `[${emailData.app_name}] แจ้งเตือนวัสดุคงเหลือต่ำกว่ากำหนด\nวัสดุ: ${emailData.item_name} (${emailData.item_code})\nโครงการ: ${emailData.project_name}\nคงเหลือ: ${emailData.current_stock}\nเกณฑ์แจ้งเตือน: ${emailData.threshold}\nเปิดดูรายการ: ${emailData.action_url}`;

    const subject = resolveSubject(
      eventConfig?.subject,
      `[${emailData.app_name}] แจ้งเตือน Stock ต่ำ — ${emailData.item_name} (${emailData.project_name})`,
      emailData
    );

    const ccList = parseEmailList(eventConfig?.cc_extra, { exclude: validRecipients });

    await sendStockFlowEmail({
      to: validRecipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text: plainText,
      actionUrl: emailData.action_url
    });

    dispatchedEventsCache.add(cacheKey);
    return { success: true, dispatched: true, recipientCount: validRecipients.length, ccCount: ccList.length };
  } catch (err) {
    console.error('[NotificationDispatcher] dispatchLowStockAlertNotification error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Per-event defaults for checkout notifications.
 * Used when an administrator has not saved a `notification_events` entry yet.
 */
const CHECKOUT_EVENT_DEFAULTS = {
  checkout_submitted: {
    roles: ['ADMIN', 'SUPERVISOR'],
    ccRoles: [],
    includeBorrower: false,
    status: 'รอตรวจสอบและอนุมัติ',
    fallbackSubject: (d) => `[${d.app_name}] มีคำขอยืมใหม่ ${d.checkout_id} รอการอนุมัติ (${d.project_name})`,
  },
  checkout_approved: {
    roles: ['STAFF'],
    ccRoles: ['ADMIN'],
    includeBorrower: true,
    status: 'อนุมัติแล้ว',
    fallbackSubject: (d) => `[${d.app_name}] คำขอยืม ${d.checkout_id} ได้รับการอนุมัติ (${d.project_name})`,
  },
  checkout_rejected: {
    roles: ['STAFF'],
    ccRoles: [],
    includeBorrower: true,
    status: 'ไม่ได้รับการอนุมัติ',
    fallbackSubject: (d) => `[${d.app_name}] คำขอยืม ${d.checkout_id} ไม่ได้รับการอนุมัติ (${d.project_name})`,
  },
  checkout_handed_over: {
    roles: ['STAFF'],
    ccRoles: ['ADMIN'],
    includeBorrower: true,
    status: 'ส่งมอบอุปกรณ์แล้ว',
    fallbackSubject: (d) => `[${d.app_name}] ใบส่งมอบอุปกรณ์ ${d.checkout_id} — กำหนดส่งคืน ${d.due_date}`,
  },
  checkout_returned: {
    roles: ['STAFF'],
    ccRoles: ['ADMIN'],
    includeBorrower: true,
    status: 'คืนอุปกรณ์เรียบร้อย',
    fallbackSubject: (d) => `[${d.app_name}] รับคืนอุปกรณ์ ${d.checkout_id} เรียบร้อยแล้ว (${d.condition})`,
  },
};

/**
 * Dispatches transactional email notifications for the equipment borrow/return
 * (/checkouts) lifecycle:
 * - checkout_submitted:   notify approvers/administrators about a new pending request
 * - checkout_approved:    notify the borrower that the request was approved
 * - checkout_rejected:    notify the borrower, including the rejection reason
 * - checkout_handed_over: notify the borrower that equipment was physically handed over
 * - checkout_returned:    notify the borrower that returned equipment was recorded
 *
 * `checkout_due_soon` and `checkout_overdue` are dispatched by the scheduled
 * api/checkouts-cron.js function instead, because no user action triggers them.
 */
export const dispatchCheckoutNotification = async ({
  eventType,
  orderId,
  orderData: preloadedOrder = null,
  approverName = '',
  rejectionReason = '',
  extraData = {}
}) => {
  if (!eventType || !orderId) {
    return { success: false, reason: 'INVALID_ARGUMENTS' };
  }

  // Suppression hook so a single user action can avoid a duplicate email
  // (e.g. an approver borrowing for themselves triggers both approved + handover).
  if (extraData.suppress) {
    return { success: true, skipped: 'SUPPRESSED' };
  }

  const cacheKey = `${eventType}:${orderId}`;
  if (dispatchedEventsCache.has(cacheKey)) {
    return { success: true, deduplicated: true };
  }

  try {
    // 1. Fetch system settings
    const { notificationEvents, branding } = await fetchNotificationSettings();

    const eventConfig = notificationEvents[eventType];
    if (eventConfig && eventConfig.enabled === false) {
      return { success: true, skipped: 'EVENT_DISABLED' };
    }

    // 2. Fetch full checkout order details if not preloaded
    let order = preloadedOrder;
    if (!order || !order.projects) {
      const { data: fetchedOrder, error: orderErr } = await supabase
        .from('checkout_orders')
        .select(`
          *,
          projects:project_id (id, name, project_code)
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (orderErr || !fetchedOrder) {
        console.warn('[NotificationDispatcher] Checkout order fetch error:', orderErr?.message);
        return { success: false, reason: 'ORDER_NOT_FOUND' };
      }
      order = fetchedOrder;
    }

    // 3. Always read line items from the database: callers pass shapes that
    // differ from the DB row shape (POS payload uses quantity/item_id and has no
    // embedded item name), so the DB is the single source of truth here.
    const { data: fetchedItems, error: itemsErr } = await supabase
      .from('checkout_items')
      .select(`
        id, quantity_borrowed, quantity_returned, serial_number, condition_on_checkout,
        items:item_id (id, name, sku, unit)
      `)
      .eq('checkout_order_id', orderId);

    if (itemsErr) {
      console.warn('[NotificationDispatcher] Checkout items fetch error:', itemsErr.message);
    }

    const dueDate = formatThaiDateOrDateTime(order.expected_return_date);
    const items = buildCheckoutEmailItems(fetchedItems || [], {
      dueDate,
      condition: extraData.condition ? formatReturnCondition(extraData.condition) : '',
    });

    // 4. Resolve recipient emails (auth.users via RPC; profiles has no email column)
    const defaults = CHECKOUT_EVENT_DEFAULTS[eventType] || {};
    const targetRoles = eventConfig?.roles || defaults.roles || ['ADMIN', 'SUPERVISOR'];
    const recipientEmails = new Set();

    const adminRoles = targetRoles.filter((role) => role !== 'STAFF');
    const searchRoles = adminRoles.length > 0
      ? adminRoles
      : (eventConfig ? [] : ['ADMIN', 'SUPERVISOR', 'SUPER']);

    const resolvedUsers = await resolveUserEmails({
      userIds: order.borrower_id ? [order.borrower_id] : null,
      roles: searchRoles,
    });
    const borrowerEmail = resolvedUsers.find((user) => user.user_id === order.borrower_id)?.email || '';

    const borrowerDirected = ['checkout_approved', 'checkout_rejected', 'checkout_handed_over', 'checkout_returned'];
    if (borrowerEmail && (defaults.includeBorrower || borrowerDirected.includes(eventType))) {
      recipientEmails.add(borrowerEmail.trim());
    }

    if (searchRoles.length > 0) {
      emailsForRoles(resolvedUsers, searchRoles).forEach((user) => {
        if (user.email) recipientEmails.add(user.email.trim());
      });
    }

    parseEmailList(eventConfig?.to_extra).forEach((entry) => recipientEmails.add(entry));

    const validRecipients = [...recipientEmails].filter(isValidEmail);

    if (!validRecipients.length) {
      return { success: true, skipped: 'NO_VALID_RECIPIENTS' };
    }

    // 5. Build template data payload shared by HTML, text and subject
    const appName = branding.app_name || 'StockFlow';
    const publicBaseUrl = branding.public_base_url || 'https://stockflowth.online';
    const todayBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const approvedDate = formatThaiDateTime(order.approved_at || new Date().toISOString());
    const returnTimestamp = extraData.returnedAt || new Date().toISOString();

    const emailItems = items.map((item) => ({
      ...item,
      due_date: dueDate,
      condition: extraData.condition ? formatReturnCondition(extraData.condition) : '',
    }));

    const emailData = {
      event_type: eventType,
      app_name: appName,
      checkout_id: order.order_number || `CHK-${String(order.id || '').slice(0, 8).toUpperCase()}`,
      borrower_name: order.borrower_name || 'ผู้ขอยืม',
      borrower_department: order.borrower_department || '-',
      borrower_phone: order.borrower_phone || '-',
      project_name: order.projects?.name || 'โครงการทั่วไป',
      project_code: order.projects?.project_code || '-',
      equipment_name: emailItems[0]?.name || '-',
      asset_code: emailItems[0]?.asset_code || '-',
      quantity: `${emailItems.reduce((sum, item) => sum + (Number(item.requested_qty) || 0), 0)} ${emailItems[0]?.unit || 'ชิ้น'}`,
      checkout_date: formatThaiDateTime(order.checkout_date || order.created_at),
      due_date: dueDate,
      return_date: extraData.returnsCompleted ? formatThaiDateTime(returnTimestamp) : '',
      days_overdue: extraData.daysOverdue || '',
      approver_name: approverName || order.approved_by_name || 'เจ้าหน้าที่คลัง',
      reject_reason: rejectionReason || order.rejection_reason || '',
      condition: extraData.condition ? formatReturnCondition(extraData.condition) : '',
      condition_details: extraData.conditionDetails || '',
      public_base_url: String(publicBaseUrl).replace(/\/+$/, ''),
      // Legacy withdrawal-style aliases kept in the shared data contract
      request_no: order.order_number || `CHK-${String(order.id || '').slice(0, 8).toUpperCase()}`,
      requester_name: order.borrower_name || 'ผู้ขอยืม',
      requester_email: borrowerEmail || '',
      user_name: order.borrower_name || 'ผู้ขอยืม',
      approved_by: approverName || order.approved_by_name || 'เจ้าหน้าที่ผู้จ่ายพัสดุ',
      rejected_by: approverName || order.rejected_by_name || 'เจ้าหน้าที่',
      rejection_reason: rejectionReason || order.rejection_reason || '',
      approved_date: approvedDate,
      rejected_date: formatThaiDateTime(order.rejected_at || new Date().toISOString()),
      status: defaults.status || order.status || '',
      fulfillment_status: order.status || 'รอพิจารณา',
      item_count: `${emailItems.length} รายการ`,
      total_quantity: `${emailItems.reduce((sum, item) => sum + (Number(item.requested_qty) || 0), 0)} ${emailItems[0]?.unit || 'ชิ้น'}`,
      purpose: order.purpose || '-',
      note: order.notes || '',
      generated_date: todayBangkok,
      action_url: `${String(publicBaseUrl).replace(/\/+$/, '')}/checkouts?order_id=${encodeURIComponent(order.order_number || order.id)}`,
      items: emailItems,
    };

    // 6. Render HTML, plain-text fallback, and the variable-resolved subject
    const template = eventConfig || {};
    const html = renderEmailHtml({ branding, template, data: emailData });
    const plainText = renderEmailText({ branding, template, data: emailData });
    const fallbackSubject = defaults.fallbackSubject
      ? defaults.fallbackSubject(emailData)
      : `${appName} — ${eventType}`;
    const subject = resolveSubject(template.subject, fallbackSubject, emailData);

    // 7. CC routing: event cc_roles (e.g. administrator on overdue) + cc_extra,
    //    never duplicating someone already in the To list.
    const ccCandidates = new Set();
    const ccRoles = eventConfig?.cc_roles || defaults.ccRoles || [];
    if (ccRoles.length > 0) {
      const ccUsers = await resolveUserEmails({ roles: ccRoles });
      emailsForRoles(ccUsers, ccRoles).forEach((user) => {
        if (user.email) ccCandidates.add(user.email.trim());
      });
    }
    parseEmailList(eventConfig?.cc_extra).forEach((email) => ccCandidates.add(email));

    const toSet = new Set(validRecipients);
    const ccList = [...ccCandidates].filter((email) => !toSet.has(email) && EMAIL_REGEX.test(email));

    // 8. Send transactional email
    await sendStockFlowEmail({
      to: validRecipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text: plainText,
      actionUrl: emailData.action_url,
    });

    dispatchedEventsCache.add(cacheKey);
    return { success: true, dispatched: true, recipientCount: validRecipients.length, ccCount: ccList.length };
  } catch (err) {
    console.error('[NotificationDispatcher] dispatchCheckoutNotification error:', err);
    return { success: false, error: err.message };
  }
};
