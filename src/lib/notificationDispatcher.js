import { supabase } from './supabase';
import { renderEmailHtml, formatThaiDateTime } from './emailRenderer';
import { sendStockFlowEmail } from './emailService';

const dispatchedEventsCache = new Set();

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
    const { data: settingsData } = await supabase.rpc('admin_get_system_settings').catch(() => ({ data: null }));
    const notificationEvents = settingsData?.notification_events || {};
    const branding = settingsData?.branding || {};

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
          projects:project_id (id, name, code),
          profiles:requested_by (id, email, full_name, role)
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

    // 4. Resolve recipient emails
    const targetRoles = eventConfig?.roles || [];
    const recipientEmails = new Set();

    // Include requester if role matches or event is directed to staff
    const requesterEmail = order.profiles?.email;
    if (requesterEmail && (targetRoles.includes('STAFF') || ['withdrawal_approved', 'withdrawal_rejected'].includes(eventType))) {
      recipientEmails.add(requesterEmail.trim());
    }

    // Include role-based recipients (e.g. ADMIN, SUPERVISOR)
    const adminRoles = targetRoles.filter(r => r !== 'STAFF');
    if (adminRoles.length > 0) {
      const { data: roleUsers } = await supabase
        .from('profiles')
        .select('email, role')
        .in('role', adminRoles);

      if (roleUsers?.length) {
        roleUsers.forEach(u => {
          if (u.email) recipientEmails.add(u.email.trim());
        });
      }
    }

    // Include explicit to_extra and cc_extra
    if (eventConfig?.to_extra) {
      String(eventConfig.to_extra).split(',').forEach(e => {
        const trimmed = e.trim();
        if (trimmed) recipientEmails.add(trimmed);
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients = [...recipientEmails].filter(e => emailRegex.test(e));

    if (!validRecipients.length) {
      return { success: true, skipped: 'NO_VALID_RECIPIENTS' };
    }

    // 5. Build template data payload
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.requested_qty) || 0), 0);
    const emailData = {
      event_type: eventType,
      app_name: branding.app_name || 'StockFlow',
      user_name: order.profiles?.full_name || order.profiles?.email || 'ผู้ขอเบิก',
      requester_name: order.profiles?.full_name || order.profiles?.email || 'ผู้ขอเบิก',
      requester_email: order.profiles?.email || '',
      request_no: order.order_no || order.request_no || `WO-${order.id?.slice(0, 8).toUpperCase()}`,
      project_name: order.projects?.name || 'โครงการทั่วไป',
      project_code: order.projects?.code || '-',
      request_date: formatThaiDateTime(order.created_at || order.requested_at),
      approved_date: formatThaiDateTime(order.approved_at || new Date().toISOString()),
      rejected_date: formatThaiDateTime(order.rejected_at || new Date().toISOString()),
      completed_date: formatThaiDateTime(order.completed_at || new Date().toISOString()),
      status: eventType === 'withdrawal_approved' ? 'อนุมัติแล้ว' : (eventType === 'withdrawal_rejected' ? 'ไม่อนุมัติ' : (eventType === 'withdrawal_completed' ? 'จ่ายวัสดุแล้ว' : 'รออนุมัติ')),
      fulfillment_status: order.fulfillment_status || order.status || 'รอพิจารณา',
      item_count: `${items.length} รายการ`,
      total_quantity: `${totalQuantity} หน่วย`,
      purpose: order.purpose || order.notes || '-',
      note: order.notes || '',
      approved_by: approverName || order.approved_by_name || 'ผู้อนุมัติ',
      rejected_by: approverName || order.rejected_by_name || 'ผู้ปฏิเสธ',
      completed_by: approverName || order.completed_by_name || 'ผู้จ่ายวัสดุ',
      rejection_reason: rejectionReason || order.rejection_reason || '',
      action_url: 'https://bearnannan.github.io/Stock-Flow',
      items
    };

    const html = renderEmailHtml({
      branding,
      template: eventConfig || {},
      data: emailData
    });

    const plainText = `[StockFlow] แจ้งเตือนรายการคำขอเบิก ${emailData.request_no}\nโครงการ: ${emailData.project_name}\nผู้ขอเบิก: ${emailData.requester_name}\nสถานะ: ${emailData.status}\nจำนวน: ${emailData.item_count}\nเปิดดูรายละเอียด: ${emailData.action_url}`;

    const subject = eventConfig?.subject
      ? eventConfig.subject.replace(/\{\{\s*request_no\s*\}\}/g, emailData.request_no).replace(/\{\{\s*project_name\s*\}\}/g, emailData.project_name)
      : `[StockFlow] แจ้งเตือนคำขอเบิก ${emailData.request_no} (${emailData.project_name})`;

    // 6. Send transactional email
    const ccList = eventConfig?.cc_extra ? String(eventConfig.cc_extra).split(',').map(s => s.trim()).filter(e => emailRegex.test(e)) : [];

    await sendStockFlowEmail({
      to: validRecipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      text: plainText,
      actionUrl: emailData.action_url
    });

    dispatchedEventsCache.add(cacheKey);
    return { success: true, dispatched: true, recipientCount: validRecipients.length };
  } catch (err) {
    console.error('[NotificationDispatcher] Dispatch error:', err);
    return { success: false, error: err.message };
  }
};
