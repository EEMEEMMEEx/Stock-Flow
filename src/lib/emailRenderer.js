/**
 * StockFlow transactional email renderer.
 * Uses only inline styles and presentational tables for Gmail and Outlook.
 */

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const formatThaiDateTime = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);

  try {
    const parts = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${value('day')} ${value('month')} ${value('year')} เวลา ${value('hour')}:${value('minute')} น.`;
  } catch {
    return `${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear() + 543} เวลา ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} น.`;
  }
};

export const SAMPLE_EMAIL_DATA = {
  event_type: 'withdrawal_approved',
  app_name: 'StockFlow',
  user_name: 'วัชระ มานะดี',
  requester_name: 'วัชระ มานะดี',
  requester_email: 'watchara@example.com',
  user_position: 'Staff',
  request_no: 'WO-0B2C1F6C',
  project_name: 'DTRS-DOPA',
  project_code: 'DTRS-DOPA-01',
  request_date: '9 สิงหาคม 2569 เวลา 15:56 น.',
  approved_date: '9 สิงหาคม 2569 เวลา 16:05 น.',
  status: 'อนุมัติแล้ว',
  status_badge: 'อนุมัติแล้ว',
  fulfillment_status: 'รอจ่ายวัสดุ',
  item_count: '4 รายการ',
  total_quantity: '170 หน่วย',
  purpose: 'ใช้ติดตั้งระบบไฟฟ้าสำหรับพื้นที่ปฏิบัติงานชั้น 3',
  note: 'โปรดจัดส่งตามแผนงานโครงการ',
  approved_by: 'Admin User',
  action_url: 'https://stockflow.app/withdrawals',
  year: new Date().getFullYear().toString(),
  items: [
    { name: 'สายไฟ THW 1x2.5 sq.mm.', sku: 'THW-1X2.5', unit: 'เมตร', requested_qty: 100, approved_qty: 80, available_stock: 80 },
    { name: 'ท่อ PVC 20 mm', sku: 'PVC-20', unit: 'เส้น', requested_qty: 20, approved_qty: 20, available_stock: 35 },
    { name: 'Cable Tie 8 นิ้ว', sku: 'CT-08', unit: 'ชิ้น', requested_qty: 50, approved_qty: 50, available_stock: 80 },
    { name: 'กล่องพักสายไฟ', sku: 'JBOX-4X4', unit: 'ใบ', requested_qty: 4, approved_qty: 4, available_stock: 10 }
  ]
};

export const SUPPORTED_EVENT_VARIABLES = {
  withdrawal_submitted: [
    ['user_name', 'ชื่อผู้ขอเบิก'], ['request_no', 'เลขที่คำขอเบิก'], ['project_name', 'ชื่อโครงการ'],
    ['project_code', 'รหัสโครงการ'], ['request_date', 'วันที่ขอเบิก'], ['item_count', 'จำนวนรายการ'],
    ['total_quantity', 'จำนวนรวม'], ['purpose', 'วัตถุประสงค์'], ['action_url', 'ลิงก์เปิดรายการ']
  ],
  withdrawal_approved: [
    ['user_name', 'ชื่อผู้ขอเบิก'], ['request_no', 'เลขที่คำขอเบิก'], ['project_name', 'ชื่อโครงการ'],
    ['approved_by', 'ผู้อนุมัติ'], ['approved_date', 'วันที่อนุมัติ'], ['action_url', 'ลิงก์เปิดรายการ']
  ],
  withdrawal_rejected: [
    ['user_name', 'ชื่อผู้ขอเบิก'], ['request_no', 'เลขที่คำขอเบิก'], ['project_name', 'ชื่อโครงการ'],
    ['rejected_by', 'ผู้ปฏิเสธ'], ['rejection_reason', 'เหตุผลที่ไม่อนุมัติ'], ['action_url', 'ลิงก์เปิดรายการ']
  ],
  withdrawal_completed: [
    ['user_name', 'ชื่อผู้ขอเบิก'], ['request_no', 'เลขที่คำขอเบิก'], ['project_name', 'ชื่อโครงการ'],
    ['completed_by', 'ผู้จ่ายวัสดุ'], ['completed_date', 'วันที่จ่ายวัสดุ'], ['action_url', 'ลิงก์เปิดรายการ']
  ]
};

Object.entries(SUPPORTED_EVENT_VARIABLES).forEach(([eventType, values]) => {
  SUPPORTED_EVENT_VARIABLES[eventType] = values.map(([code, desc]) => ({ code: `{{${code}}}`, desc }));
});

const EVENT_DEFAULTS = {
  withdrawal_submitted: {
    badge: 'คำขอเบิกใหม่', type: 'warning',
    heading: 'มีคำขอเบิกจ่ายวัสดุใหม่เข้าระบบ',
    intro: 'สวัสดีครับ<br />{{requester_name}} ได้ส่งคำขอเบิกจ่ายวัสดุเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} และกำลังรอการพิจารณาอนุมัติ',
    cta: 'ตรวจสอบและพิจารณาคำขอ',
    helper: 'กรุณาตรวจสอบรายการวัสดุและจำนวนคงเหลือก่อนดำเนินการอนุมัติ'
  },
  withdrawal_approved: {
    badge: 'อนุมัติแล้ว', type: 'approved',
    heading: 'คำขอเบิกจ่ายวัสดุของคุณได้รับการอนุมัติแล้ว',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ได้รับการอนุมัติโดย {{approved_by}}',
    cta: 'ดูรายละเอียดและเตรียมรับวัสดุ',
    helper: 'คุณสามารถตรวจสอบรายการวัสดุที่ได้รับอนุมัติและสถานะการจ่ายวัสดุได้จากระบบ'
  },
  withdrawal_rejected: {
    badge: 'ไม่อนุมัติ', type: 'rejected',
    heading: 'คำขอเบิกจ่ายวัสดุไม่ได้รับการอนุมัติ',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ไม่ได้รับการอนุมัติ กรุณาตรวจสอบเหตุผลด้านล่าง',
    cta: 'ดูเหตุผลที่ไม่อนุมัติ',
    helper: 'กรุณาตรวจสอบเหตุผลและแก้ไขคำขอก่อนส่งใหม่'
  },
  withdrawal_completed: {
    badge: 'จ่ายวัสดุแล้ว', type: 'completed',
    heading: 'ดำเนินการจ่ายวัสดุเรียบร้อยแล้ว',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ได้รับการจ่ายวัสดุเรียบร้อยแล้ว',
    cta: 'ดูประวัติการจ่ายวัสดุ',
    helper: 'คุณสามารถตรวจสอบจำนวนวัสดุที่จ่ายจริงได้จากระบบ'
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const sanitizeColor = (value) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value || '').trim())
  ? String(value).trim()
  : '#2563eb';

const sanitizeHttpUrl = (value, fallback = '#') => {
  try {
    const url = new URL(String(value || '').trim());
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !isLocal ? url.href : fallback;
  } catch {
    return fallback;
  }
};

export const resolveEmailVariables = (text = '', data = SAMPLE_EMAIL_DATA) => {
  let result = String(text || '');
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
    }
  });
  return result.replace(/{{\s*[\w.-]+\s*}}/g, '');
};

const renderText = (value, safeData) => resolveEmailVariables(escapeHtml(value), safeData).replace(/&lt;br\s*\/??&gt;/gi, '<br />');

const statusColors = (type) => {
  if (type === 'approved' || type === 'completed' || type === 'success') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (type === 'rejected' || type === 'danger') return { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' };
  if (type === 'warning' || type === 'pending') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
};

const renderRow = (label, value, { emphasis = false } = {}) => hasValue(value) ? `
  <tr>
    <td width="39%" style="padding: 7px 0; vertical-align: top; font-size: 13px; line-height: 19px; color: #64748b; font-weight: 600;">${label}</td>
    <td width="61%" style="padding: 7px 0; vertical-align: top; font-size: 13px; line-height: 19px; color: ${emphasis ? '#0f172a' : '#334155'}; font-weight: ${emphasis ? '700' : '400'}; overflow-wrap: anywhere; word-break: break-word;">${value}</td>
  </tr>` : '';

const formatQuantity = (quantity, unit) => `${escapeHtml(quantity)} ${escapeHtml(unit || 'หน่วย')}`;

const renderMaterialDetails = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return '';

  const cards = items.map((item, index) => {
    const requested = item.requested_qty ?? item.quantity;
    const approved = item.approved_qty;
    const issued = item.issued_qty;
    const unit = item.unit || 'หน่วย';
    const hasApproved = hasValue(approved);
    const hasIssued = hasValue(issued);
    const approvedDiffers = hasApproved && Number(approved) !== Number(requested);
    const issuedDiffers = hasIssued && Number(issued) !== Number(requested);
    const quantityRows = [
      renderRow('จำนวนที่ขอ:', hasValue(requested) ? formatQuantity(requested, unit) : ''),
      hasApproved ? renderRow('จำนวนที่อนุมัติ:', `${formatQuantity(approved, unit)}${approvedDiffers ? ' <span style="display: inline-block; margin-left: 5px; padding: 1px 6px; border-radius: 999px; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700;">ต่างจากที่ขอ</span>' : ''}`, { emphasis: true }) : '',
      hasIssued ? renderRow('จำนวนที่จ่าย:', `${formatQuantity(issued, unit)}${issuedDiffers ? ' <span style="display: inline-block; margin-left: 5px; padding: 1px 6px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700;">ต่างจากที่ขอ</span>' : ''}`, { emphasis: true }) : '',
      renderRow(item.available_stock_label || 'คงเหลือขณะขอเบิก:', hasValue(item.available_stock) ? formatQuantity(item.available_stock, unit) : '')
    ].join('');

    return `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: ${index ? '12px' : '0'}; border: 1px solid #dbe4f0; border-radius: 10px; background-color: #ffffff;">
        <tr>
          <td style="padding: 14px 14px 8px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="30" style="vertical-align: top; padding-right: 8px;"><span style="display: inline-block; width: 22px; height: 22px; border-radius: 50%; background-color: #eff6ff; color: #1d4ed8; font-size: 12px; line-height: 22px; text-align: center; font-weight: 700;">${index + 1}</span></td>
                <td style="vertical-align: top; font-size: 14px; line-height: 20px; font-weight: 700; color: #0f172a; overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(item.name || item.item_name || 'วัสดุไม่ระบุชื่อ')}<br />${hasValue(item.sku || item.item_sku || item.item_code) ? `<span style="font-family: Consolas, 'Courier New', monospace; font-size: 11px; line-height: 17px; font-weight: 600; color: #64748b;">รหัสวัสดุ: ${escapeHtml(item.sku || item.item_sku || item.item_code)}</span>` : ''}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 14px 10px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${quantityRows}</table>
          </td>
        </tr>
      </table>`;
  }).join('');

  return `
    <tr><td style="padding: 2px 0 20px;">
      <h2 style="margin: 0 0 10px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">รายการวัสดุที่ขอเบิก</h2>
      ${cards}
    </td></tr>`;
};

const renderWorkflow = (data, event) => {
  const eventData = EVENT_DEFAULTS[event] || EVENT_DEFAULTS.withdrawal_submitted;
  const rows = [
    renderRow('สถานะปัจจุบัน:', data.fulfillment_status || data.status, { emphasis: true }),
    renderRow('ผู้อนุมัติ:', data.approved_by),
    renderRow('วันที่อนุมัติ:', data.approved_date),
    renderRow('ผู้ปฏิเสธ:', data.rejected_by),
    renderRow('วันที่ปฏิเสธ:', data.rejected_date),
    renderRow('ผู้จ่ายวัสดุ:', data.completed_by),
    renderRow('วันที่จ่ายวัสดุ:', data.completed_date)
  ].join('');
  const reason = hasValue(data.rejection_reason) ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 12px; border: 1px solid #fca5a5; border-radius: 8px; background-color: #fff1f2;">
      <tr><td style="padding: 12px 13px;">
        <div style="font-size: 13px; line-height: 19px; font-weight: 700; color: #b91c1c;">เหตุผลที่ไม่อนุมัติ</div>
        <div style="padding-top: 4px; font-size: 13px; line-height: 20px; color: #7f1d1d; overflow-wrap: anywhere; word-break: break-word;">${data.rejection_reason}</div>
      </td></tr>
    </table>` : '';
  if (!rows && !reason) return '';
  const colors = statusColors(eventData.type);
  return `
    <tr><td style="padding: 0 0 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #dbe4f0; border-left: 4px solid ${colors.text}; border-radius: 10px; background-color: #f8fafc;">
        <tr><td style="padding: 14px 16px;">
          <h2 style="margin: 0 0 6px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">รายละเอียดสถานะและการดำเนินการ</h2>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
          ${reason}
        </td></tr>
      </table>
    </td></tr>`;
};

const renderNotes = (data) => {
  const rows = [renderRow('วัตถุประสงค์:', data.purpose), renderRow('หมายเหตุ:', data.note)].join('');
  if (!rows) return '';
  return `
    <tr><td style="padding: 0 0 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #dbe4f0; border-radius: 10px; background-color: #ffffff;">
        <tr><td style="padding: 14px 16px;">
          <h2 style="margin: 0 0 6px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">วัตถุประสงค์ / หมายเหตุ</h2>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
        </td></tr>
      </table>
    </td></tr>`;
};

export const renderEmailHtml = ({ branding = {}, template = {}, data = SAMPLE_EMAIL_DATA }) => {
  const rawEvent = data.event_type || template.event_type || 'withdrawal_submitted';
  const event = EVENT_DEFAULTS[rawEvent] ? rawEvent : 'withdrawal_submitted';
  const defaults = EVENT_DEFAULTS[event];
  const safeData = {
    ...data,
    app_name: escapeHtml(data.app_name || 'StockFlow'),
    request_no: escapeHtml(data.request_no || ''),
    project_name: escapeHtml(data.project_name || ''),
    project_code: escapeHtml(data.project_code || ''),
    requester_name: escapeHtml(data.requester_name || data.user_name || ''),
    user_name: escapeHtml(data.user_name || data.requester_name || ''),
    recipient_name: escapeHtml(data.recipient_name || ''),
    requester_email: escapeHtml(data.requester_email || data.user_email || ''),
    request_date: escapeHtml(data.request_date || formatThaiDateTime(data.requested_at)),
    approved_date: escapeHtml(data.approved_date || formatThaiDateTime(data.approved_at)),
    rejected_date: escapeHtml(data.rejected_date || formatThaiDateTime(data.rejected_at)),
    completed_date: escapeHtml(data.completed_date || formatThaiDateTime(data.completed_at)),
    status: escapeHtml(data.status || ''),
    status_badge: escapeHtml(data.status_badge || ''),
    fulfillment_status: escapeHtml(data.fulfillment_status || ''),
    item_count: escapeHtml(data.item_count || ''),
    total_quantity: escapeHtml(data.total_quantity || ''),
    purpose: escapeHtml(data.purpose || ''),
    note: escapeHtml(data.note || ''),
    approved_by: escapeHtml(data.approved_by || ''),
    rejected_by: escapeHtml(data.rejected_by || ''),
    completed_by: escapeHtml(data.completed_by || ''),
    rejection_reason: escapeHtml(data.rejection_reason || ''),
    year: escapeHtml(data.year || String(new Date().getFullYear()))
  };
  const accentColor = sanitizeColor(branding.accent_color);
  const appName = escapeHtml(branding.app_name || data.app_name || 'StockFlow');
  const logoUrl = sanitizeHttpUrl(branding.logo_url, '');
  const actionUrl = sanitizeHttpUrl(resolveEmailVariables(template.cta_url || data.action_url || '', data), 'https://stockflow.app/withdrawals');
  const statusType = template.status_type || defaults.type;
  const status = statusColors(statusType);
  const heading = renderText(template.heading || defaults.heading, safeData);
  const intro = renderText(template.intro || defaults.intro, safeData);
  const ctaLabel = renderText(template.cta_label || defaults.cta, safeData);
  const helper = renderText(template.footer_note || defaults.helper, safeData);
  const badge = renderText(safeData.status_badge || template.status_label || defaults.badge, safeData);
  const preheader = renderText(template.preheader || `คำขอ ${safeData.request_no} สำหรับโครงการ ${safeData.project_name} มี ${safeData.item_count || 'รายการวัสดุ'} และอยู่ในสถานะ ${safeData.status || defaults.badge}`, safeData);
  const footerText = renderText(branding.footer_text || 'อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ StockFlow', safeData);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const summaryRows = [
    renderRow('เลขที่คำขอ:', safeData.request_no, { emphasis: true }),
    renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
    renderRow('รหัสโครงการ:', safeData.project_code),
    renderRow('ผู้ขอเบิก:', safeData.requester_name),
    renderRow('อีเมล:', safeData.requester_email),
    renderRow('วันที่ขอเบิก:', safeData.request_date),
    renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
    renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
    renderRow('จำนวนรวม:', safeData.total_quantity)
  ].join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${renderText(template.subject || appName, safeData)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Tahoma, 'Noto Sans Thai', sans-serif; color: #334155;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: #f1f5f9; font-size: 1px; line-height: 1px;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #f1f5f9;">
    <tr><td align="center" style="padding: 24px 12px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: 620px; background-color: #ffffff; border: 1px solid #dbe4f0; border-radius: 14px; overflow: hidden;">
        <tr><td style="padding: 20px 28px; border-bottom: 3px solid ${accentColor};">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="vertical-align: middle;">${logoUrl ? `<img src="${logoUrl}" alt="${appName}" style="display: block; max-width: 170px; max-height: 36px; width: auto; border: 0;" />` : `<span style="font-size: 22px; line-height: 28px; font-weight: 800; color: ${accentColor};">${appName}</span>`}</td>
            <td align="right" style="vertical-align: middle; font-size: 10px; line-height: 14px; font-weight: 700; letter-spacing: .3px; color: #64748b;">INVENTORY MANAGEMENT SYSTEM</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding: 28px 28px 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding-bottom: 13px;"><span style="display: inline-block; padding: 5px 11px; border: 1px solid ${status.border}; border-radius: 999px; background-color: ${status.bg}; color: ${status.text}; font-size: 12px; line-height: 16px; font-weight: 700;">${badge}</span></td></tr>
            <tr><td><h1 style="margin: 0 0 10px; font-size: 22px; line-height: 30px; font-weight: 700; color: #0f172a;">${heading}</h1></td></tr>
            <tr><td style="padding-bottom: 20px; font-size: 14px; line-height: 22px; color: #475569;">${intro}</td></tr>
            ${summaryRows ? `<tr><td style="padding-bottom: 20px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #dbe4f0; border-radius: 10px; background-color: #f8fafc;"><tr><td style="padding: 14px 16px;"><h2 style="margin: 0 0 6px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">สรุปคำขอเบิก</h2><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${summaryRows}</table></td></tr></table></td></tr>` : ''}
            ${renderMaterialDetails(rawItems)}
            ${renderWorkflow(safeData, event)}
            ${renderNotes(safeData)}
            <tr><td align="center" style="padding: 2px 0 14px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius: 8px; background-color: ${accentColor};"><a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 13px 24px; border: 1px solid ${accentColor}; border-radius: 8px; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 700; text-decoration: none;">${ctaLabel}</a></td></tr></table></td></tr>
            <tr><td align="center" style="padding: 0 0 20px; font-size: 12px; line-height: 18px; color: #64748b;">หากปุ่มด้านบนไม่ทำงาน สามารถเปิดรายการได้จากลิงก์นี้:<br /><a href="${actionUrl}" target="_blank" style="color: ${accentColor}; font-weight: 600; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word;">${actionUrl}</a></td></tr>
            <tr><td style="padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; line-height: 18px; color: #64748b;">${helper}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding: 16px 28px; border-top: 1px solid #dbe4f0; background-color: #f8fafc; font-size: 12px; line-height: 18px; color: #64748b;">${footerText}<br />© ${safeData.year} ${appName} · Inventory Management System</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

export const renderTestEmailHtml = ({ appName = 'StockFlow', isoTimestamp = new Date().toISOString() }) => renderEmailHtml({
  branding: { app_name: appName },
  template: {
    event_type: 'withdrawal_submitted',
    heading: 'ทดสอบการเชื่อมต่ออีเมล — StockFlow',
    intro: `ระบบส่งอีเมลทำงานสำเร็จเมื่อ ${formatThaiDateTime(isoTimestamp)}`,
    cta_label: 'เปิดระบบ StockFlow',
    cta_url: 'https://stockflow.app/withdrawals',
    footer_note: 'นี่คืออีเมลทดสอบการเชื่อมต่อ SMTP จากระบบ StockFlow'
  },
  data: {
    ...SAMPLE_EMAIL_DATA,
    event_type: 'withdrawal_submitted',
    app_name: appName,
    status: 'ทดสอบการเชื่อมต่อ',
    status_badge: 'ทดสอบการเชื่อมต่อ',
    items: []
  }
});

export const renderUserInvitationEmailHtml = ({
  appName = 'StockFlow',
  userName,
  userEmail,
  roleName,
  projectAccessSummary,
  actionUrl,
  branding = {},
  tempPassword = 'F0rth2026@dtrs',
}) => {
  const accent = sanitizeColor(branding.accent_color);
  const safeUrl = sanitizeHttpUrl(actionUrl, 'https://bearnannan.github.io/Stock-Flow');
  const effectiveAppName = escapeHtml(branding.app_name || appName);
  const rows = [
    renderRow('ชื่อผู้ใช้งาน:', escapeHtml(userName)),
    renderRow('อีเมล:', escapeHtml(userEmail)),
    renderRow('บทบาท:', escapeHtml(roleName)),
    renderRow('สิทธิ์โครงการ:', escapeHtml(projectAccessSummary)),
    renderRow(
      'รหัสผ่านเริ่มต้น (ชั่วคราว):',
      `<code style="font-family: Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #0f172a; background-color: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${escapeHtml(tempPassword)}</code>`,
      { emphasis: true }
    )
  ].join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ยินดีต้อนรับสู่ ${effectiveAppName}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f1f5f9; font-family: Arial, Tahoma, 'Noto Sans Thai', sans-serif; color: #334155;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #f1f5f9;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; margin: auto; background-color: #ffffff; border: 1px solid #dbe4f0; border-radius: 14px; overflow: hidden;">
          <tr>
            <td style="padding: 22px 28px; border-bottom: 3px solid ${accent};">
              <strong style="font-size: 22px; color: ${accent}; font-weight: 800;">${effectiveAppName}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 28px 24px;">
              <h1 style="margin: 0 0 10px; font-size: 22px; line-height: 30px; font-weight: 700; color: #0f172a;">ยินดีต้อนรับสู่ ${effectiveAppName}</h1>
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #475569;">
                สวัสดีคุณ <strong>${escapeHtml(userName || '')}</strong> ผู้ดูแลระบบได้สร้างบัญชีผู้ใช้งานสำหรับคุณเรียบร้อยแล้ว
              </p>
              
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background-color: #f8fafc;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <h2 style="margin: 0 0 8px; font-size: 15px; line-height: 20px; font-weight: 700; color: #0f172a;">ข้อมูลบัญชีผู้ใช้งาน</h2>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      ${rows}
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; background-color: #fffbeb;">
                <tr>
                  <td style="padding: 12px 14px;">
                    <div style="font-size: 13px; line-height: 18px; font-weight: 700; color: #92400e;">⚠️ คำแนะนำความปลอดภัย (Security Notice)</div>
                    <div style="padding-top: 4px; font-size: 13px; line-height: 20px; color: #78350f;">
                      รหัสผ่านข้างต้นเป็น<strong>รหัสผ่านชั่วคราว (Temporary Password)</strong> กรุณาเข้าสู่ระบบและดำเนินการ<strong>เปลี่ยนรหัสผ่านใหม่ทันที</strong>เมื่อเข้าใช้งานครั้งแรกเพื่อความปลอดภัยของบัญชี
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 16px;">
                <tr>
                  <td align="center">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: ${accent};">
                          <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 13px 28px; border: 1px solid ${accent}; border-radius: 8px; background-color: ${accent}; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 700; text-decoration: none;">เข้าสู่ระบบ ${effectiveAppName}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; text-align: center; font-size: 12px; line-height: 18px; color: #64748b;">
                หากปุ่มด้านบนไม่ทำงาน สามารถเข้าใช้งานผ่านลิงก์นี้:<br />
                <a href="${safeUrl}" target="_blank" style="color: ${accent}; font-weight: 600; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 16px 28px; border-top: 1px solid #dbe4f0; background-color: #f8fafc; font-size: 12px; line-height: 18px; color: #64748b;">
              อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ ${effectiveAppName} · Inventory Management System
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
