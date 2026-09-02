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

const SAMPLE_ITEM_DATA = [
  { name: 'สายไฟ THW 1x2.5 sq.mm.', sku: 'THW-1X2.5', unit: 'เมตร', requested_qty: 100, approved_qty: 80, available_stock: 80 },
  { name: 'ท่อ PVC 20 mm', sku: 'PVC-20', unit: 'เส้น', requested_qty: 20, approved_qty: 20, available_stock: 35 },
  { name: 'Cable Tie 8 นิ้ว', sku: 'CT-08', unit: 'ชิ้น', requested_qty: 50, approved_qty: 50, available_stock: 80 },
  { name: 'กล่องพักสายไฟ', sku: 'JBOX-4X4', unit: 'ใบ', requested_qty: 4, approved_qty: 4, available_stock: 10 }
];

export const SAMPLE_EMAIL_DATA_BY_EVENT = {
  withdrawal_submitted: {
    event_type: 'withdrawal_submitted',
    app_name: 'StockFlow',
    user_name: 'วัชระ มานะดี',
    requester_name: 'วัชระ มานะดี',
    requester_email: 'watchara@example.com',
    user_position: 'Staff',
    request_no: 'WO-0B2C1F6C',
    project_name: 'DTRS-DOPA',
    project_code: 'DTRS-DOPA-01',
    request_date: '9 สิงหาคม 2569 เวลา 15:56 น.',
    status: 'รออนุมัติ',
    status_badge: 'คำขอเบิกใหม่',
    fulfillment_status: 'รอพิจารณาอนุมัติ',
    item_count: '4 รายการ',
    total_quantity: '174 หน่วย',
    purpose: 'ใช้ติดตั้งระบบไฟฟ้าสำหรับพื้นที่ปฏิบัติงานชั้น 3',
    note: 'โปรดจัดส่งตามแผนงานโครงการ',
    action_url: 'https://stockflowth.online/withdrawals',
    items: SAMPLE_ITEM_DATA,
  },
  withdrawal_approved: {
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
    total_quantity: '154 หน่วย',
    purpose: 'ใช้ติดตั้งระบบไฟฟ้าสำหรับพื้นที่ปฏิบัติงานชั้น 3',
    note: 'โปรดจัดส่งตามแผนงานโครงการ',
    approved_by: 'Admin User',
    action_url: 'https://stockflowth.online/withdrawals',
    items: SAMPLE_ITEM_DATA,
  },
  withdrawal_rejected: {
    event_type: 'withdrawal_rejected',
    app_name: 'StockFlow',
    user_name: 'วัชระ มานะดี',
    requester_name: 'วัชระ มานะดี',
    requester_email: 'watchara@example.com',
    user_position: 'Staff',
    request_no: 'WO-0B2C1F6C',
    project_name: 'DTRS-DOPA',
    project_code: 'DTRS-DOPA-01',
    request_date: '9 สิงหาคม 2569 เวลา 15:56 น.',
    rejected_date: '9 สิงหาคม 2569 เวลา 16:15 น.',
    status: 'ไม่ได้รับการอนุมัติ',
    status_badge: 'ไม่ได้รับการอนุมัติ',
    fulfillment_status: 'ยกเลิกคำขอ',
    item_count: '4 รายการ',
    total_quantity: '174 หน่วย',
    purpose: 'ใช้ติดตั้งระบบไฟฟ้าสำหรับพื้นที่ปฏิบัติงานชั้น 3',
    note: 'โปรดจัดส่งตามแผนงานโครงการ',
    rejected_by: 'Admin User',
    rejection_reason: 'วัสดุบางรายการมียอดคงเหลือไม่เพียงพอสำหรับรอบการเบิกนี้ กรุณาปรับลดจำนวนและส่งคำขอใหม่อีกครั้ง',
    action_url: 'https://stockflowth.online/withdrawals',
    items: SAMPLE_ITEM_DATA,
  },
  withdrawal_completed: {
    event_type: 'withdrawal_completed',
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
    completed_date: '9 สิงหาคม 2569 เวลา 16:45 น.',
    status: 'จ่ายวัสดุแล้ว',
    status_badge: 'จ่ายวัสดุแล้ว',
    fulfillment_status: 'จ่ายวัสดุครบถ้วน',
    item_count: '4 รายการ',
    total_quantity: '154 หน่วย',
    purpose: 'ใช้ติดตั้งระบบไฟฟ้าสำหรับพื้นที่ปฏิบัติงานชั้น 3',
    note: 'โปรดจัดส่งตามแผนงานโครงการ',
    completed_by: 'Warehouse Admin',
    action_url: 'https://stockflowth.online/withdrawals',
    items: SAMPLE_ITEM_DATA.map(item => ({
      ...item,
      issued_qty: item.approved_qty,
    })),
  },
  stock_in_created: {
    event_type: 'stock_in_created',
    app_name: 'StockFlow',
    stock_in_no: 'SI-2026-00042',
    project_name: 'DTRS-DOPA',
    project_code: 'DTRS-DOPA-01',
    received_by: 'Warehouse Admin',
    received_date: '9 สิงหาคม 2569 เวลา 14:30 น.',
    supplier_name: 'Forth Supply Co., Ltd.',
    po_number: 'PO-2026-0042',
    status: 'รับเข้า Stock แล้ว',
    status_badge: 'รับเข้า Stock',
    item_count: '2 รายการ',
    total_quantity: '70 หน่วย',
    action_url: 'https://stockflowth.online/stock-in',
    items: [
      { name: 'สายไฟ THW 1x2.5 sq.mm.', sku: 'THW-1X2.5', unit: 'เมตร', quantity: 50, available_stock: 130 },
      { name: 'กล่องพักสายไฟ', sku: 'JBOX-4X4', unit: 'ใบ', quantity: 20, available_stock: 48 },
    ],
  },
  low_stock_alert: {
    event_type: 'low_stock_alert',
    app_name: 'StockFlow',
    item_name: 'สายไฟ THW 1x2.5 sq.mm.',
    item_code: 'THW-1X2.5',
    project_name: 'DTRS-DOPA',
    project_code: 'DTRS-DOPA-01',
    warehouse_name: 'คลังกลาง กรุงเทพฯ',
    current_stock: '8 เมตร',
    threshold: '20 เมตร',
    status: 'ถึงจุดสั่งซื้อ',
    status_badge: 'ต้องเติมสต็อก',
    action_url: 'https://stockflowth.online/items',
    items: [
      {
        name: 'สายไฟ THW 1x2.5 sq.mm.',
        sku: 'THW-1X2.5',
        unit: 'เมตร',
        requested_qty: 8,
        available_stock: 8,
        threshold: '20 เมตร',
        available_stock_label: 'ยอดคงเหลือปัจจุบัน:'
      }
    ],
  },
};

export const SAMPLE_EMAIL_DATA = {
  ...SAMPLE_EMAIL_DATA_BY_EVENT.withdrawal_approved,
  app_name: 'StockFlow',
  year: new Date().getFullYear().toString(),
  items: SAMPLE_ITEM_DATA,
};

export const getSampleEmailData = (eventType) => {
  const base = SAMPLE_EMAIL_DATA_BY_EVENT[eventType] || SAMPLE_EMAIL_DATA_BY_EVENT.withdrawal_submitted;
  return {
    ...base,
    app_name: base.app_name || 'StockFlow',
    year: new Date().getFullYear().toString(),
  };
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
  ],
  stock_in_created: [
    ['stock_in_no', 'เลขที่รายการรับเข้า'], ['project_name', 'ชื่อโครงการ'], ['project_code', 'รหัสโครงการ'],
    ['received_by', 'ผู้รับเข้า'], ['received_date', 'วันที่รับเข้า'], ['supplier_name', 'ผู้จัดจำหน่าย'],
    ['po_number', 'เลขที่ใบสั่งซื้อ'], ['action_url', 'ลิงก์เปิดรายการ']
  ],
  low_stock_alert: [
    ['item_name', 'ชื่อวัสดุ'], ['item_code', 'รหัสวัสดุ'], ['project_name', 'ชื่อโครงการ'],
    ['project_code', 'รหัสโครงการ'], ['warehouse_name', 'คลังจัดเก็บ'], ['current_stock', 'คงเหลือปัจจุบัน'],
    ['threshold', 'เกณฑ์แจ้งเตือน'], ['action_url', 'ลิงก์เปิดรายการ']
  ],
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
    badge: 'ไม่ได้รับการอนุมัติ', type: 'rejected',
    heading: 'คำขอเบิกจ่ายวัสดุไม่ได้รับการอนุมัติ',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ไม่ได้รับการอนุมัติ กรุณาตรวจสอบเหตุผลและรายละเอียดด้านล่าง',
    cta: 'ดูรายละเอียดคำขอเบิก',
    helper: 'กรุณาตรวจสอบเหตุผลและแก้ไขคำขอก่อนส่งใหม่'
  },
  withdrawal_completed: {
    badge: 'จ่ายวัสดุแล้ว', type: 'completed',
    heading: 'ดำเนินการจ่ายวัสดุเรียบร้อยแล้ว',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ได้รับการจ่ายวัสดุเรียบร้อยแล้ว',
    cta: 'ดูประวัติการจ่ายวัสดุ',
    helper: 'คุณสามารถตรวจสอบจำนวนวัสดุที่จ่ายจริงได้จากระบบ'
  },
  stock_in_created: {
    badge: 'รับเข้า Stock', type: 'info',
    heading: 'มีการรับวัสดุเข้าสต็อกเรียบร้อยแล้ว',
    intro: 'มีการบันทึกรายการรับเข้า Stock เลขที่ {{stock_in_no}} สำหรับโครงการ {{project_name}} เรียบร้อยแล้ว',
    cta: 'ดูรายการรับเข้า Stock',
    helper: 'รายการวัสดุใหม่ถูกเพิ่มเข้าสู่ยอดคงเหลือพร้อมเบิกทันที'
  },
  low_stock_alert: {
    badge: 'ต้องเติมสต็อก', type: 'warning',
    heading: 'แจ้งเตือนรายการวัสดุถึงจุดสั่งซื้อ (Reorder Point Alert)',
    intro: 'รายการวัสดุ "{{item_name}}" ในโครงการ {{project_name}} มียอดคงเหลือปัจจุบัน {{current_stock}} ซึ่งต่ำกว่าเกณฑ์การสั่งซื้อเติมคลัง ({{threshold}})',
    cta: 'ดูรายการวัสดุและวางแผนสั่งซื้อ',
    helper: 'กรุณาตรวจสอบยอดคงเหลือและวางแผนจัดซื้อเพื่อความต่อเนื่องของโครงการ'
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

const renderText = (value, data) => resolveEmailVariables(escapeHtml(value), data);

const EMAIL_THEME = {
  page: '#f8fafc',
  surface: '#ffffff',
  panel: '#f8fafc',
  border: '#e2e8f0',
  strongText: '#0f172a',
  bodyText: '#334155',
  mutedText: '#64748b',
  accent: '#2563eb',
};

const statusColors = (type) => {
  if (type === 'approved' || type === 'completed') {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  }
  if (type === 'rejected') {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  }
  if (type === 'warning') {
    return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
};

const renderRow = (label, value, { emphasis = false } = {}) => hasValue(value) ? `
  <tr>
    <td width="39%" style="padding: 7px 0; vertical-align: top; font-size: 13px; line-height: 19px; color: ${EMAIL_THEME.mutedText}; font-weight: 600;">${label}</td>
    <td width="61%" style="padding: 7px 0; vertical-align: top; font-size: 13px; line-height: 19px; color: ${emphasis ? EMAIL_THEME.strongText : EMAIL_THEME.bodyText}; font-weight: ${emphasis ? '700' : '400'}; overflow-wrap: anywhere; word-break: break-word;">${value}</td>
  </tr>` : '';

const formatQuantity = (quantity, unit) => `${escapeHtml(quantity)} ${escapeHtml(unit || 'หน่วย')}`;

const renderMaterialDetails = (items = [], heading = 'รายการวัสดุที่ขอเบิก') => {
  if (!Array.isArray(items) || items.length === 0) return '';

  const isStockIn = heading.includes('รับเข้า');
  const isLowStock = heading.includes('เติมสต็อก') || heading.includes('จุดสั่งซื้อ') || heading.includes('สต็อกต่ำ');

  const cards = items.map((item, index) => {
    const requested = item.requested_qty ?? item.quantity;
    const approved = item.approved_qty;
    const issued = item.issued_qty;
    const unit = item.unit || 'หน่วย';
    const hasApproved = hasValue(approved);
    const hasIssued = hasValue(issued);
    const approvedDiffers = hasApproved && Number(approved) !== Number(requested);
    const issuedDiffers = hasIssued && Number(issued) !== Number(requested);
    const quantityRows = isStockIn ? [
      renderRow('จำนวนที่รับเข้า:', hasValue(requested) ? formatQuantity(requested, unit) : ''),
      renderRow('คงเหลือหลังรับเข้า:', hasValue(item.available_stock) ? formatQuantity(item.available_stock, unit) : '')
    ].filter(Boolean).join('') : isLowStock ? [
      renderRow('คงเหลือปัจจุบัน:', hasValue(item.available_stock ?? requested) ? formatQuantity(item.available_stock ?? requested, unit) : '', { emphasis: true }),
      renderRow('เกณฑ์แจ้งเตือนสต็อกต่ำ:', hasValue(item.threshold || item.min_quantity) ? formatQuantity(item.threshold || item.min_quantity, unit) : ''),
      renderRow('สถานะ:', item.status_label || 'ต้องเติมสต็อก', { emphasis: true })
    ].filter(Boolean).join('') : [
      renderRow('จำนวนที่ขอ:', hasValue(requested) ? formatQuantity(requested, unit) : ''),
      hasApproved ? renderRow('จำนวนที่อนุมัติ:', `${formatQuantity(approved, unit)}${approvedDiffers ? ' <span style="display: inline-block; margin-left: 5px; padding: 1px 6px; border-radius: 999px; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700;">ต่างจากที่ขอ</span>' : ''}`, { emphasis: true }) : '',
      hasIssued ? renderRow('จำนวนที่จ่าย:', `${formatQuantity(issued, unit)}${issuedDiffers ? ' <span style="display: inline-block; margin-left: 5px; padding: 1px 6px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700;">ต่างจากที่ขอ</span>' : ''}`, { emphasis: true }) : '',
      renderRow(item.available_stock_label || 'คงเหลือขณะขอเบิก:', hasValue(item.available_stock) ? formatQuantity(item.available_stock, unit) : '')
    ].filter(Boolean).join('');

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
      <h2 style="margin: 0 0 10px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">${heading}</h2>
      ${cards}
    </td></tr>`;
};

const renderSectionCard = ({ title, content, accentColor = EMAIL_THEME.accent, backgroundColor = EMAIL_THEME.panel }) => `
    <tr><td style="padding: 0 0 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid ${EMAIL_THEME.border}; border-left: 4px solid ${accentColor}; border-radius: 10px; background-color: ${backgroundColor};">
        <tr><td style="padding: 16px 18px;">
          <h2 style="margin: 0 0 8px; font-size: 16px; line-height: 22px; font-weight: 700; color: ${EMAIL_THEME.strongText};">${title}</h2>
          ${content}
        </td></tr>
      </table>
    </td></tr>`;

const renderWorkflow = (data, event) => {
  const eventData = EVENT_DEFAULTS[event] || EVENT_DEFAULTS.withdrawal_submitted;
  const rowsByEvent = {
    withdrawal_submitted: [
      renderRow('สถานะปัจจุบัน:', data.fulfillment_status || data.status, { emphasis: true }),
    ],
    withdrawal_approved: [
      renderRow('สถานะปัจจุบัน:', data.fulfillment_status || data.status, { emphasis: true }),
      renderRow('ผู้อนุมัติ:', data.approved_by),
      renderRow('วันที่อนุมัติ:', data.approved_date),
    ],
    withdrawal_rejected: [
      renderRow('สถานะปัจจุบัน:', data.fulfillment_status || data.status, { emphasis: true }),
      renderRow('ผู้ปฏิเสธ:', data.rejected_by),
      renderRow('วันที่ปฏิเสธ:', data.rejected_date),
    ],
    withdrawal_completed: [
      renderRow('สถานะปัจจุบัน:', data.fulfillment_status || data.status, { emphasis: true }),
      renderRow('ผู้จ่ายวัสดุ:', data.completed_by),
      renderRow('วันที่จ่ายวัสดุ:', data.completed_date),
    ],
    stock_in_created: [
      renderRow('สถานะรายการ:', data.status, { emphasis: true }),
      renderRow('ผู้รับเข้า:', data.received_by),
      renderRow('วันที่รับเข้า:', data.received_date),
    ],
    low_stock_alert: [],
  };
  const rows = (rowsByEvent[event] || rowsByEvent.withdrawal_submitted).join('');
  const reason = hasValue(data.rejection_reason) ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 12px; border: 1px solid #fed7aa; border-radius: 8px; background-color: #fff7ed;">
      <tr><td style="padding: 12px 13px;">
        <div style="font-size: 13px; line-height: 19px; font-weight: 700; color: #9a3412;">เหตุผลการไม่อนุมัติ / ข้อเสนอแนะ:</div>
        <div style="padding-top: 4px; font-size: 13px; line-height: 20px; color: #7c2d12; overflow-wrap: anywhere; word-break: break-word;">${data.rejection_reason}</div>
      </td></tr>
    </table>` : '';
  if (!rows && !reason) return '';
  const colors = statusColors(eventData.type);
  const title = event === 'stock_in_created'
    ? 'รายละเอียดการรับเข้า'
    : event === 'low_stock_alert'
      ? 'รายละเอียดการแจ้งเตือน'
      : 'รายละเอียดสถานะและการดำเนินการ';
  return renderSectionCard({
    title,
    accentColor: colors.text,
    content: `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>${reason}`,
  });
};

const renderNotes = (data) => {
  const rows = [renderRow('วัตถุประสงค์:', data.purpose), renderRow('หมายเหตุ:', data.note)].join('');
  if (!rows) return '';
  return renderSectionCard({
    title: 'วัตถุประสงค์ / หมายเหตุ',
    backgroundColor: EMAIL_THEME.surface,
    content: `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`,
  });
};

export const renderEmailHtml = ({ branding = {}, template = {}, data = SAMPLE_EMAIL_DATA }) => {
  const rawEvent = template.event_type || data.event_type || 'withdrawal_submitted';
  const event = EVENT_DEFAULTS[rawEvent] ? rawEvent : 'withdrawal_submitted';
  const defaults = EVENT_DEFAULTS[event];
  const safeData = {
    ...data,
    app_name: escapeHtml(data.app_name || 'StockFlow'),
    project_name: escapeHtml(data.project_name || '-'),
    project_code: escapeHtml(data.project_code || '-'),
    user_name: escapeHtml(data.user_name || data.requester_name || 'ผู้ใช้งาน'),
    requester_name: escapeHtml(data.requester_name || data.user_name || 'ผู้ขอเบิก'),
    requester_email: escapeHtml(data.requester_email || ''),
    user_position: escapeHtml(data.user_position || '-'),
    request_no: escapeHtml(data.request_no || '-'),
    stock_in_no: escapeHtml(data.stock_in_no || '-'),
    item_name: escapeHtml(data.item_name || 'วัสดุ'),
    item_code: escapeHtml(data.item_code || '-'),
    warehouse_name: escapeHtml(data.warehouse_name || '-'),
    current_stock: escapeHtml(data.current_stock || '0'),
    threshold: escapeHtml(data.threshold || '0'),
    supplier_name: escapeHtml(data.supplier_name || '-'),
    po_number: escapeHtml(data.po_number || '-'),
    received_by: escapeHtml(data.received_by || '-'),
    received_date: escapeHtml(data.received_date || '-'),
    request_date: escapeHtml(data.request_date || '-'),
    approved_date: escapeHtml(data.approved_date || '-'),
    rejected_date: escapeHtml(data.rejected_date || '-'),
    completed_date: escapeHtml(data.completed_date || '-'),
    status: escapeHtml(data.status || ''),
    status_badge: escapeHtml(data.status_badge || ''),
    fulfillment_status: escapeHtml(data.fulfillment_status || ''),
    item_count: escapeHtml(data.item_count || ''),
    total_quantity: escapeHtml(data.total_quantity || ''),
    purpose: escapeHtml(data.purpose || ''),
    note: escapeHtml(data.note || ''),
    approved_by: escapeHtml(data.approved_by || '-'),
    rejected_by: escapeHtml(data.rejected_by || '-'),
    completed_by: escapeHtml(data.completed_by || '-'),
    rejection_reason: escapeHtml(data.rejection_reason || ''),
    year: escapeHtml(data.year || String(new Date().getFullYear()))
  };
  const accentColor = sanitizeColor(branding.accent_color);
  const appName = escapeHtml(branding.app_name || data.app_name || 'StockFlow');
  const logoUrl = sanitizeHttpUrl(branding.logo_url, '');
  const actionUrl = sanitizeHttpUrl(resolveEmailVariables(template.cta_url || data.action_url || '', data), 'https://stockflowth.online/withdrawals');
  const statusType = template.status_type || defaults.type;
  const status = statusColors(statusType);
  const heading = renderText(template.heading || defaults.heading, safeData);
  const intro = renderText(template.intro || defaults.intro, safeData);
  const ctaLabel = renderText(template.cta_label || defaults.cta, safeData);
  const helper = renderText(template.footer_note || defaults.helper, safeData);
  const badge = renderText(safeData.status_badge || template.status_label || defaults.badge, safeData);

  const defaultPreheaders = {
    withdrawal_submitted: `คำขอ ${safeData.request_no} สำหรับโครงการ ${safeData.project_name} มี ${safeData.item_count || 'รายการวัสดุ'} และอยู่ในสถานะ ${safeData.status || defaults.badge}`,
    withdrawal_approved: `คำขอเบิก ${safeData.request_no} สำหรับโครงการ ${safeData.project_name} ได้รับการอนุมัติแล้ว`,
    withdrawal_rejected: `คำขอเบิก ${safeData.request_no} สำหรับโครงการ ${safeData.project_name} ไม่ได้รับการอนุมัติ`,
    withdrawal_completed: `คำขอเบิก ${safeData.request_no} สำหรับโครงการ ${safeData.project_name} จ่ายวัสดุเรียบร้อยแล้ว`,
    stock_in_created: `บันทึกรับเข้า Stock ${safeData.stock_in_no} สำหรับโครงการ ${safeData.project_name} จำนวน ${safeData.item_count || 'พัสดุ'} เรียบร้อยแล้ว`,
    low_stock_alert: `แจ้งเตือนวัสดุ ${safeData.item_name} ในโครงการ ${safeData.project_name} คงเหลือ ${safeData.current_stock} ต่ำกว่าเกณฑ์ ${safeData.threshold}`,
  };
  const preheader = renderText(template.preheader || defaultPreheaders[event] || `แจ้งเตือนจากระบบ ${appName}`, safeData);

  const footerText = renderText(branding.footer_text || 'อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ StockFlow', safeData);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const summaryByEvent = {
    withdrawal_submitted: {
      title: 'สรุปคำขอเบิก',
      rows: [
        renderRow('เลขที่คำขอ:', safeData.request_no, { emphasis: true }),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('ผู้ขอเบิก:', safeData.requester_name),
        renderRow('อีเมล:', safeData.requester_email),
        renderRow('วันที่ขอเบิก:', safeData.request_date),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
        renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
        renderRow('จำนวนรวม:', safeData.total_quantity),
      ],
    },
    withdrawal_approved: {
      title: 'สรุปคำขอเบิก',
      rows: [
        renderRow('เลขที่คำขอ:', safeData.request_no, { emphasis: true }),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('ผู้ขอเบิก:', safeData.requester_name),
        renderRow('วันที่ขอเบิก:', safeData.request_date),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
        renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
        renderRow('จำนวนรวม:', safeData.total_quantity),
      ],
    },
    withdrawal_rejected: {
      title: 'สรุปคำขอเบิก',
      rows: [
        renderRow('เลขที่คำขอ:', safeData.request_no, { emphasis: true }),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('ผู้ขอเบิก:', safeData.requester_name),
        renderRow('วันที่ขอเบิก:', safeData.request_date),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
        renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
        renderRow('จำนวนรวม:', safeData.total_quantity),
      ],
    },
    withdrawal_completed: {
      title: 'สรุปคำขอเบิก',
      rows: [
        renderRow('เลขที่คำขอ:', safeData.request_no, { emphasis: true }),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('ผู้ขอเบิก:', safeData.requester_name),
        renderRow('วันที่ขอเบิก:', safeData.request_date),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
        renderRow('วันที่จ่ายวัสดุ:', safeData.completed_date),
        renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
        renderRow('จำนวนรวม:', safeData.total_quantity),
      ],
    },
    stock_in_created: {
      title: 'สรุปรายการรับเข้า Stock',
      rows: [
        renderRow('เลขที่รับเข้า:', safeData.stock_in_no, { emphasis: true }),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('ผู้รับเข้า:', safeData.received_by),
        renderRow('วันที่รับเข้า:', safeData.received_date),
        renderRow('ผู้จัดจำหน่าย:', safeData.supplier_name),
        renderRow('เลขที่ใบสั่งซื้อ:', safeData.po_number),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
        renderRow('จำนวนรายการ:', safeData.item_count || (rawItems.length ? `${rawItems.length} รายการ` : '')),
        renderRow('จำนวนรวม:', safeData.total_quantity),
      ],
    },
    low_stock_alert: {
      title: 'สรุปแจ้งเตือน Stock ต่ำ',
      rows: [
        renderRow('วัสดุ:', safeData.item_name, { emphasis: true }),
        renderRow('รหัสวัสดุ:', safeData.item_code),
        renderRow('โครงการ:', safeData.project_name, { emphasis: true }),
        renderRow('รหัสโครงการ:', safeData.project_code),
        renderRow('คลังจัดเก็บ:', safeData.warehouse_name),
        renderRow('คงเหลือปัจจุบัน:', safeData.current_stock, { emphasis: true }),
        renderRow('เกณฑ์แจ้งเตือน:', safeData.threshold),
        renderRow('สถานะ:', safeData.status || badge, { emphasis: true }),
      ],
    },
  };
  const summary = summaryByEvent[event] || summaryByEvent.withdrawal_submitted;
  const summaryRows = summary.rows.join('');

  const summaryCard = renderSectionCard({
    title: summary.title,
    content: `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${summaryRows}</table>`,
  });

  const materialHeading = event === 'stock_in_created'
    ? 'รายการวัสดุที่รับเข้า'
    : (event === 'low_stock_alert' ? 'รายการวัสดุที่ต้องเติมสต็อก' : 'รายการวัสดุที่ขอเบิก');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${renderText(template.subject || appName, safeData)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_THEME.page}; font-family: Arial, Tahoma, 'Noto Sans Thai', sans-serif; color: ${EMAIL_THEME.bodyText};">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${preheader}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: ${EMAIL_THEME.page};">
    <tr><td align="center" style="padding: 24px 12px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: 620px; background-color: ${EMAIL_THEME.surface}; border: 1px solid ${EMAIL_THEME.border}; border-radius: 14px; overflow: hidden;">
        <tr><td style="padding: 20px 28px; border-bottom: 3px solid ${accentColor};">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="vertical-align: middle;">${logoUrl ? `<img src="${logoUrl}" alt="${appName}" style="display: block; max-width: 170px; max-height: 36px; width: auto; border: 0;" />` : `<span style="font-size: 22px; line-height: 28px; font-weight: 800; color: ${accentColor};">${appName}</span>`}</td>
            <td align="right" style="vertical-align: middle; font-size: 10px; line-height: 14px; font-weight: 700; letter-spacing: .3px; color: #64748b;">INVENTORY MANAGEMENT SYSTEM</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding: 28px 28px 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding-bottom: 13px;"><span style="display: inline-block; padding: 5px 11px; border: 1px solid ${status.border}; border-radius: 999px; background-color: ${status.bg}; color: ${status.text}; font-size: 12px; line-height: 16px; font-weight: 700;">${badge}</span></td></tr>
            <tr><td><h1 style="margin: 0 0 10px; font-size: 22px; line-height: 30px; font-weight: 700; color: ${EMAIL_THEME.strongText};">${heading}</h1></td></tr>
            <tr><td style="padding-bottom: 20px; font-size: 14px; line-height: 22px; color: #475569;">${intro}</td></tr>
            ${summaryRows ? summaryCard : ''}
            ${renderMaterialDetails(rawItems, materialHeading)}
            ${renderWorkflow(safeData, event)}
            ${renderNotes(safeData)}
            <tr><td align="center" style="padding: 2px 0 14px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius: 8px; background-color: ${accentColor};"><a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 13px 24px; border: 1px solid ${accentColor}; border-radius: 8px; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 700; text-decoration: none;">${ctaLabel}</a></td></tr></table></td></tr>
            <tr><td align="center" style="padding: 0 0 20px; font-size: 12px; line-height: 18px; color: #64748b;">หากปุ่มด้านบนไม่ทำงาน สามารถเปิดรายการได้จากลิงก์นี้:<br /><a href="${actionUrl}" target="_blank" style="color: ${accentColor}; font-weight: 600; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word;">${actionUrl}</a></td></tr>
            <tr><td style="padding-top: 14px; border-top: 1px solid ${EMAIL_THEME.border}; font-size: 12px; line-height: 18px; color: ${EMAIL_THEME.mutedText};">${helper}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding: 16px 28px; border-top: 1px solid ${EMAIL_THEME.border}; background-color: ${EMAIL_THEME.panel}; font-size: 12px; line-height: 18px; color: ${EMAIL_THEME.mutedText};">${footerText}<br />© ${safeData.year} ${appName} · Inventory Management System</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

export const renderTestEmailHtml = ({
  appName = 'StockFlow',
  isoTimestamp = new Date().toISOString(),
  branding = {},
  template = null,
  data = null
} = {}) => {
  const effectiveAppName = escapeHtml(branding.app_name || appName || 'StockFlow');
  if (template) {
    const eventType = data?.event_type || template.event_type || 'withdrawal_submitted';
    return renderEmailHtml({
      branding: { app_name: effectiveAppName, ...branding },
      template: { ...template, event_type: eventType },
      data: { ...getSampleEmailData(eventType), ...(data || {}), event_type: eventType }
    });
  }

  const timeStr = typeof isoTimestamp === 'string' && (isoTimestamp.includes('GMT') || isoTimestamp.includes('UTC'))
    ? isoTimestamp
    : (new Date(isoTimestamp).toUTCString() !== 'Invalid Date' ? new Date(isoTimestamp).toUTCString() : formatThaiDateTime(isoTimestamp));

  return `<table role="presentation" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff; font-family:'Sarabun', 'Noto Sans Thai', Arial, sans-serif; border:1px solid #e2e8f0; border-radius:8px; padding:24px;">
  <tr>
    <td>
      <h2 style="color:#0f172a; margin-top:0;">แจ้งเตือนการทดสอบระบบอีเมล (${effectiveAppName} SMTP Test)</h2>
      <p style="color:#334155; font-size:14px; line-height:1.6;">เรียน ผู้ใช้งาน,</p>
      <p style="color:#334155; font-size:14px; line-height:1.6;">นี่คืออีเมลทดสอบการเชื่อมต่อระบบแจ้งเตือนอัตโนมัติของ ${effectiveAppName}</p>
      <table style="width:100%; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin:16px 0; font-size:13px;">
        <tr><td style="padding:4px 8px; color:#64748b; width:120px;">เวลาที่ส่ง:</td><td style="padding:4px 8px; color:#0f172a;">${timeStr}</td></tr>
        <tr><td style="padding:4px 8px; color:#64748b;">สถานะ:</td><td style="padding:4px 8px; color:#16a34a; font-weight:bold;">จัดส่งสำเร็จ</td></tr>
      </table>
      <p style="color:#64748b; font-size:12px; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:12px;">อีเมลนี้ส่งโดยอัตโนมัติจากระบบ ${effectiveAppName} กรุณาอย่าตอบกลับ</p>
    </td>
  </tr>
</table>`;
};

export const renderEmailText = ({ branding = {}, template = {}, data = SAMPLE_EMAIL_DATA }) => {
  const event = template.event_type || data.event_type || 'withdrawal_submitted';
  const defaults = EVENT_DEFAULTS[event] || EVENT_DEFAULTS.withdrawal_submitted;
  const appName = branding.app_name || data.app_name || 'StockFlow';
  const actionUrl = sanitizeHttpUrl(resolveEmailVariables(template.cta_url || data.action_url || '', data), 'https://stockflowth.online/withdrawals');
  const heading = resolveEmailVariables(template.heading || defaults.heading, data);
  const intro = resolveEmailVariables(template.intro || defaults.intro, data).replace(/<br\s*\/?>/gi, '\n');

  let bodyDetails = '';
  if (event === 'stock_in_created') {
    bodyDetails = `เลขที่รับเข้า: ${data.stock_in_no || '-'}\nโครงการ: ${data.project_name || '-'}\nผู้รับเข้า: ${data.received_by || '-'}\nวันที่รับเข้า: ${data.received_date || '-'}\nจำนวนรายการ: ${data.item_count || '-'}`;
  } else if (event === 'low_stock_alert') {
    bodyDetails = `วัสดุ: ${data.item_name || '-'}\nรหัสวัสดุ: ${data.item_code || '-'}\nโครงการ: ${data.project_name || '-'}\nคลังจัดเก็บ: ${data.warehouse_name || '-'}\nคงเหลือปัจจุบัน: ${data.current_stock || '-'}\nเกณฑ์แจ้งเตือน: ${data.threshold || '-'}`;
  } else {
    bodyDetails = `เลขที่คำขอ: ${data.request_no || '-'}\nโครงการ: ${data.project_name || '-'}\nผู้ขอเบิก: ${data.requester_name || data.user_name || '-'}\nสถานะ: ${data.status || defaults.badge}\nจำนวนรายการ: ${data.item_count || '-'}`;
  }

  return `[${appName}] ${heading}\n\n${intro}\n\n${bodyDetails}\n\nเปิดดูรายการในระบบ: ${actionUrl}\n\n---\nอีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ ${appName}`;
};

export const renderUserInvitationEmailText = ({
  appName = 'StockFlow',
  userName,
  userEmail,
  roleName,
  projectAccessSummary,
  actionUrl,
  branding = {},
  tempPassword = '',
}) => {
  const effectiveAppName = branding.app_name || appName;
  const safeUrl = sanitizeHttpUrl(actionUrl, 'https://bearnannan.github.io/Stock-Flow');

  return `[${effectiveAppName}] แจ้งเปิดสิทธิ์การใช้งานระบบ ${effectiveAppName}

เรียน คุณ ${userName || ''},

ผู้ดูแลระบบได้กำหนดสิทธิ์และเปิดการใช้งานระบบ ${effectiveAppName} สำหรับคุณเรียบร้อยแล้ว ท่านสามารถเข้าใช้งานระบบเพื่อบริหารจัดการพัสดุและโครงการตามที่ได้รับมอบหมาย

[ข้อมูลบัญชีผู้ใช้งาน]
- ชื่อผู้ใช้งาน: ${userName || '-'}
- อีเมลผู้ใช้งาน: ${userEmail || '-'}
- บทบาทในระบบ: ${roleName || '-'}
- โครงการที่ได้รับมอบหมาย: ${projectAccessSummary || 'ตามสิทธิ์ที่ได้รับมอบหมาย'}${tempPassword ? `\n- รหัสผ่านตั้งต้น (Initial Access): ${tempPassword}` : ''}

เปิดเข้าใช้งานระบบ ${effectiveAppName}:
${safeUrl}

---
อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ ${effectiveAppName} (Inventory Management System)`;
};

export const renderUserInvitationEmailHtml = ({
  appName = 'StockFlow',
  userName,
  userEmail,
  roleName,
  projectAccessSummary,
  actionUrl,
  branding = {},
  tempPassword = '',
}) => {
  const accent = sanitizeColor(branding.accent_color || '#2563eb');
  const safeUrl = sanitizeHttpUrl(actionUrl, 'https://bearnannan.github.io/Stock-Flow');
  const effectiveAppName = escapeHtml(branding.app_name || appName);
  const year = new Date().getFullYear().toString();
  const preheader = `ระบบ ${effectiveAppName} ได้เปิดสิทธิ์การใช้งานสำหรับคุณ ${escapeHtml(userName || '')} เรียบร้อยแล้ว`;
  const rows = [
    renderRow('ชื่อผู้ใช้งาน:', escapeHtml(userName || '-'), { emphasis: true }),
    renderRow('อีเมลผู้ใช้งาน:', escapeHtml(userEmail || '-')),
    renderRow('บทบาทในระบบ:', escapeHtml(roleName || '-'), { emphasis: true }),
    renderRow('โครงการที่ได้รับมอบหมาย:', escapeHtml(projectAccessSummary || 'ตามสิทธิ์ที่ได้รับมอบหมาย')),
    tempPassword ? renderRow(
      'รหัสผ่านตั้งต้น (Initial Access):',
      `<code style="font-family: Consolas, 'Courier New', monospace; font-size: 13px; font-weight: 700; color: #0f172a; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">${escapeHtml(tempPassword)}</code>`,
      { emphasis: true }
    ) : ''
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[${effectiveAppName}] แจ้งเปิดสิทธิ์การใช้งานระบบ ${effectiveAppName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: Arial, Tahoma, 'Noto Sans Thai', sans-serif; color: #334155;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${preheader}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #f8fafc;">
    <tr><td align="center" style="padding: 24px 12px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: 620px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
        <tr><td style="padding: 20px 28px; border-bottom: 3px solid ${accent};">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="vertical-align: middle;"><span style="font-size: 22px; line-height: 28px; font-weight: 800; color: ${accent};">${effectiveAppName}</span></td>
            <td align="right" style="vertical-align: middle; font-size: 10px; line-height: 14px; font-weight: 700; letter-spacing: .3px; color: #64748b;">INVENTORY MANAGEMENT SYSTEM</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding: 28px 28px 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding-bottom: 13px;"><span style="display: inline-block; padding: 5px 11px; border: 1px solid #86efac; border-radius: 999px; background-color: #dcfce7; color: #166534; font-size: 12px; line-height: 16px; font-weight: 700;">เปิดสิทธิ์การใช้งาน</span></td></tr>
            <tr><td><h1 style="margin: 0 0 10px; font-size: 22px; line-height: 30px; font-weight: 700; color: #0f172a;">แจ้งเปิดสิทธิ์การใช้งานระบบ ${effectiveAppName}</h1></td></tr>
            <tr><td style="padding-bottom: 20px; font-size: 14px; line-height: 22px; color: #475569;">เรียน คุณ <strong>${escapeHtml(userName || '')}</strong>,<br />ผู้ดูแลระบบได้กำหนดสิทธิ์และเปิดการใช้งานระบบ ${effectiveAppName} สำหรับคุณเรียบร้อยแล้ว ท่านสามารถเข้าใช้งานระบบเพื่อบริหารจัดการพัสดุและโครงการตามที่ได้รับมอบหมาย</td></tr>
            <tr><td style="padding: 0 0 20px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e2e8f0; border-left: 4px solid ${accent}; border-radius: 10px; background-color: #f8fafc;">
                <tr><td style="padding: 16px 18px;">
                  <h2 style="margin: 0 0 8px; font-size: 16px; line-height: 22px; font-weight: 700; color: #0f172a;">ข้อมูลบัญชีผู้ใช้งาน</h2>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
                </td></tr>
              </table>
            </td></tr>
            <tr><td align="center" style="padding: 2px 0 14px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius: 8px; background-color: ${accent};"><a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 13px 24px; border: 1px solid ${accent}; border-radius: 8px; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 700; text-decoration: none;">เปิดเข้าใช้งานระบบ ${effectiveAppName}</a></td></tr></table></td></tr>
            <tr><td align="center" style="padding: 0 0 20px; font-size: 12px; line-height: 18px; color: #64748b;">หากปุ่มด้านบนไม่ทำงาน สามารถเปิดเข้าใช้งานได้จากลิงก์นี้:<br /><a href="${safeUrl}" target="_blank" style="color: ${accent}; font-weight: 600; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word;">${safeUrl}</a></td></tr>
            <tr><td style="padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; line-height: 18px; color: #64748b;">หากมีข้อสงสัยเกี่ยวกับการใช้งานหรือสิทธิ์โครงการ สามารถติดต่อผู้ดูแลระบบได้โดยตรง</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding: 16px 28px; border-top: 1px solid #e2e8f0; background-color: #f8fafc; font-size: 12px; line-height: 18px; color: #64748b;">อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ ${effectiveAppName}<br />© ${year} ${effectiveAppName} · Inventory Management System</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};
