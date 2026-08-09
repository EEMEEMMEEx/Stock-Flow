/**
 * StockFlow Transactional Email HTML Renderer (v2.0)
 * Production-safe, inline-styled, table-based HTML generator compatible with major email clients
 * (Gmail, Outlook Desktop/Web, Apple Mail, iOS Mail, Android Mail).
 */

/**
 * Format timestamp into Thai locale-aware string (e.g. 9 สิงหาคม 2569 เวลา 15:44 น.)
 */
export const formatThaiDateTime = (dateVal) => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const monthsThai = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const day = d.getDate();
    const month = monthsThai[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
  } catch {
    return String(dateVal);
  }
};

export const SAMPLE_EMAIL_DATA = {
  user_name: 'สมชาย ใจดี',
  user_email: 'somchai.j@stockflow.com',
  user_position: 'วิศวกรสนาม (Site Engineer)',
  request_no: 'WO-2BE6FB09',
  project_name: 'โครงการอาคารพาณิชย์ A (Sukhumvit 21)',
  project_code: 'DTRS-DOPA-01',
  request_date: '9 สิงหาคม 2569 เวลา 15:44 น.',
  approved_date: '9 สิงหาคม 2569 เวลา 15:45 น.',
  status: 'อนุมัติแล้ว / รอจ่ายวัสดุ',
  item_count: '3 รายการ',
  total_quantity: '112 หน่วย',
  purpose: 'ใช้สำหรับติดตั้งระบบไฟฟ้าและเดินสายไฟประจำชั้น 3 และ 4 อาคาร A',
  approved_by: 'วิศวกรสมศักดิ์ (Project Manager)',
  rejection_reason: 'จำนวนวัสดุที่ขอเกินเกณฑ์การสำรองคงคลังประจำสัปดาห์ กรุณาปรับลดจำนวนแล้วส่งคำขอใหม่',
  override_reason: 'อนุมัติกรณีพิเศษตามคำสั่งผู้จัดการโครงการ (Shortage Override)',
  stock_in_no: 'RCV-2026-0089',
  item_name: 'สายไฟ THW 1x2.5 sq.mm.',
  item_sku: 'THW-1X2.5-RD',
  current_stock: '5 ชิ้น',
  threshold: '10 ชิ้น',
  app_name: 'StockFlow',
  company_name: 'StockFlow Co., Ltd.',
  action_url: 'https://stockflow.app/withdrawals/WO-2BE6FB09',
  year: new Date().getFullYear().toString(),
  items: [
    { name: 'สายไฟ THW 1x2.5 sq.mm. (สีแดง)', sku: 'THW-1X2.5-RD', unit: 'เมตร', requested_qty: 100, approved_qty: 100, current_stock: 450 },
    { name: 'ท่อ PVC 20 mm (ตราตราช้าง)', sku: 'PVC-20-SCG', unit: 'เส้น', requested_qty: 10, approved_qty: 10, current_stock: 80 },
    { name: 'กล่องพักสายไฟ Square Box 4x4', sku: 'SQB-4X4-MET', unit: 'ใบ', requested_qty: 2, approved_qty: 2, current_stock: 25 }
  ]
};

export const SUPPORTED_EVENT_VARIABLES = {
  withdrawal_submitted: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{project_code}}', desc: 'รหัสโครงการ' },
    { code: '{{request_date}}', desc: 'วันที่ส่งคำขอ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการ' },
    { code: '{{total_quantity}}', desc: 'จำนวนรวม' },
    { code: '{{purpose}}', desc: 'วัตถุประสงค์ในการขอเบิก' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูและพิจารณาคำขอ' }
  ],
  withdrawal_approved: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{request_date}}', desc: 'วันที่อนุมัติ' },
    { code: '{{approved_by}}', desc: 'ผู้อนุมัติ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการ' },
    { code: '{{total_quantity}}', desc: 'จำนวนรวม' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูรายละเอียดการอนุมัติ' }
  ],
  withdrawal_rejected: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{rejection_reason}}', desc: 'เหตุผลการปฏิเสธ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูรายละเอียดและแก้ไข' }
  ],
  withdrawal_completed: [
    { code: '{{user_name}}', desc: 'ชื่อผู้เบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{action_url}}', desc: 'ลิงก์ประวัติการเบิก' }
  ],
  stock_in_created: [
    { code: '{{stock_in_no}}', desc: 'เลขที่ใบรับเข้า' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการรับเข้า' },
    { code: '{{action_url}}', desc: 'ลิงก์ประวัติรับเข้า Stock' }
  ],
  low_stock_alert: [
    { code: '{{item_name}}', desc: 'ชื่อวัสดุ' },
    { code: '{{current_stock}}', desc: 'จำนวนคงเหลือปัจจุบัน' },
    { code: '{{threshold}}', desc: 'เกณฑ์แจ้งเตือนสต็อกต่ำ' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูคลังวัสดุ' }
  ]
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sanitizeColor = (value) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value || '').trim())
  ? String(value).trim()
  : '#3b82f6';

const sanitizeHttpUrl = (value, fallback = '#') => {
  try {
    const str = String(value || '').trim();
    if (!str || str === '#') return fallback;
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Replaces placeholders in text with sample or real data
 */
export const resolveEmailVariables = (text = '', data = SAMPLE_EMAIL_DATA) => {
  if (!text) return '';
  let result = text;
  Object.entries(data).forEach(([key, val]) => {
    if (typeof val === 'string' || typeof val === 'number') {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, val);
    }
  });
  return result.replace(/{{\s*[\w.-]+\s*}}/g, '');
};

/**
 * Returns HTML badge styling for status header (Accessible Contrast + Text)
 */
const getStatusBadgeHtml = (statusType = 'info', label = '') => {
  let bgColor = '#e0f2fe';
  let textColor = '#0369a1';
  let borderColor = '#bae6fd';

  if (statusType === 'success' || statusType === 'approved') {
    bgColor = '#dcfce7';
    textColor = '#15803d';
    borderColor = '#bbf7d0';
  } else if (statusType === 'danger' || statusType === 'rejected') {
    bgColor = '#fee2e2';
    textColor = '#b91c1c';
    borderColor = '#fca5a5';
  } else if (statusType === 'warning' || statusType === 'pending') {
    bgColor = '#fef3c7';
    textColor = '#b45309';
    borderColor = '#fde68a';
  }

  return `
    <div style="display: inline-block; padding: 5px 14px; border-radius: 9999px; background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
      ${label}
    </div>
  `;
};

/**
 * Renders HTML table for item-level details (Section 3)
 */
const renderItemsTableHtml = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return '';

  const maxVisible = 5;
  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  let rowsHtml = '';
  visibleItems.forEach((item, index) => {
    const itemName = escapeHtml(item.name || item.item_name || 'วัสดุไม่ระบุชื่อ');
    const sku = escapeHtml(item.sku || item.item_sku || item.item_code || '-');
    const unit = escapeHtml(item.unit || 'ชิ้น');
    const reqQty = item.requested_qty ?? item.quantity ?? 1;
    const appQty = item.approved_qty;
    const stock = item.current_stock;

    let qtyDisplay = `${reqQty} ${unit}`;
    if (appQty !== undefined && appQty !== null) {
      qtyDisplay = `<strong style="color: #166534;">${appQty} ${unit}</strong> <span style="font-size: 11px; color: #64748b;">(ขอเบิก ${reqQty})</span>`;
    }

    rowsHtml += `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 13px; color: #64748b; font-weight: 600; vertical-align: top; text-align: center;" width="8%">${index + 1}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; vertical-align: top;" width="57%">
          <div style="font-weight: 700; color: #0f172a; line-height: 1.4;">${itemName}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, monospace;">SKU: ${sku}</div>
        </td>
        <td style="padding: 10px 12px; font-size: 13px; color: #334155; vertical-align: top; text-align: right; font-weight: 600;" width="35%">
          ${qtyDisplay}
          ${stock !== undefined ? `<div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">คงเหลือ: ${stock} ${unit}</div>` : ''}
        </td>
      </tr>
    `;
  });

  if (hiddenCount > 0) {
    rowsHtml += `
      <tr>
        <td colspan="3" style="padding: 10px 12px; background-color: #f8fafc; font-size: 12px; color: #475569; text-align: center; font-weight: 600; border-top: 1px solid #e2e8f0;">
          ... และอีก ${hiddenCount} รายการ (ดูรายละเอียดทั้งหมดในระบบ)
        </td>
      </tr>
    `;
  }

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
      <thead>
        <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #475569; text-align: center;" width="8%">#</th>
          <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #475569; text-align: left;" width="57%">รายการวัสดุ / SKU</th>
          <th style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #475569; text-align: right;" width="35%">จำนวน</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
};

/**
 * Renders complete Production-Safe HTML Email
 */
export const renderEmailHtml = ({
  branding = {},
  template = {},
  data = SAMPLE_EMAIL_DATA
}) => {
  // Safe Data Normalization
  const safeData = {
    ...data,
    project_name: escapeHtml(data.project_name || ''),
    project_code: escapeHtml(data.project_code || ''),
    request_no: escapeHtml(data.request_no || data.stock_in_no || ''),
    user_name: escapeHtml(data.user_name || ''),
    user_email: escapeHtml(data.user_email || ''),
    user_position: escapeHtml(data.user_position || ''),
    request_date: escapeHtml(data.request_date || formatThaiDateTime(data.created_at)),
    approved_date: escapeHtml(data.approved_date || formatThaiDateTime(data.approved_at)),
    status: escapeHtml(data.status || 'ดำเนินการเรียบร้อย'),
    item_count: escapeHtml(data.item_count || ''),
    total_quantity: escapeHtml(data.total_quantity || ''),
    purpose: escapeHtml(data.purpose || data.note || ''),
    approved_by: escapeHtml(data.approved_by || ''),
    rejection_reason: escapeHtml(data.rejection_reason || ''),
    override_reason: escapeHtml(data.override_reason || ''),
    action_url: sanitizeHttpUrl(resolveEmailVariables(template.cta_url || data.action_url || '', data), 'https://stockflow.app'),
    year: escapeHtml(data.year || new Date().getFullYear().toString())
  };

  const appName = escapeHtml(branding.app_name || data.app_name || 'StockFlow');
  const accentColor = sanitizeColor(branding.accent_color);
  const logoUrl = sanitizeHttpUrl(branding.logo_url);
  const footerText = escapeHtml(branding.footer_text || 'หากคุณไม่ได้ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อความปลอดภัย');

  const heading = resolveEmailVariables(template.heading || 'คำแจ้งเตือนจากระบบ StockFlow', safeData);
  const intro = resolveEmailVariables(template.intro || 'มีรายการอัปเดตใหม่ในระบบ StockFlow ของคุณ', safeData);
  const ctaLabel = resolveEmailVariables(template.cta_label || 'ดูรายละเอียดในระบบ', safeData);
  const ctaUrl = safeData.action_url;
  const footerNote = resolveEmailVariables(template.footer_note || footerText, safeData);

  const statusLabel = escapeHtml(resolveEmailVariables(template.status_label || safeData.status || 'รายการใหม่', safeData));
  const statusType = template.status_type || 'info';

  const preheaderText = escapeHtml(resolveEmailVariables(
    template.preheader || `คำขอ {{request_no}} สำหรับโครงการ {{project_name}} ({{item_count}})`,
    safeData
  ));

  // Determine items list
  const rawItems = Array.isArray(data.items) && data.items.length > 0
    ? data.items
    : (data.item_name ? [{ name: data.item_name, sku: data.item_sku, current_stock: data.current_stock, requested_qty: 1 }] : []);

  const itemsTableHtml = renderItemsTableHtml(rawItems);

  // Construct Conditional Request Summary Rows (Section 2)
  let summaryRowsHtml = '';

  if (safeData.project_name) {
    const projectDisplay = safeData.project_code ? `${safeData.project_name} <span style="font-size: 11px; color: #64748b; font-family: monospace;">(${safeData.project_code})</span>` : safeData.project_name;
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;" width="38%">โครงการ:</td>
        <td style="font-size: 13px; color: #0f172a; padding: 6px 0; font-weight: 700;" width="62%">${projectDisplay}</td>
      </tr>
    `;
  }

  if (safeData.request_no) {
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">เลขที่อ้างอิง / คำขอ:</td>
        <td style="font-size: 13px; color: #0f172a; padding: 6px 0; font-weight: 700; font-family: ui-monospace, SFMono-Regular, monospace;">${safeData.request_no}</td>
      </tr>
    `;
  }

  if (safeData.user_name) {
    const userDisplay = safeData.user_position ? `${safeData.user_name} <span style="font-size: 11px; color: #64748b;">(${safeData.user_position})</span>` : safeData.user_name;
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">ผู้ทำรายการ / ขอเบิก:</td>
        <td style="font-size: 13px; color: #0f172a; padding: 6px 0; font-weight: 600;">${userDisplay}</td>
      </tr>
    `;
  }

  if (safeData.request_date) {
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">วันที่ส่งคำขอ / เวลา:</td>
        <td style="font-size: 13px; color: #334155; padding: 6px 0;">${safeData.request_date}</td>
      </tr>
    `;
  }

  if (safeData.item_count || safeData.total_quantity) {
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">สรุปจำนวนรายการ:</td>
        <td style="font-size: 13px; color: #334155; padding: 6px 0;">${safeData.item_count}${safeData.total_quantity ? ` (${safeData.total_quantity})` : ''}</td>
      </tr>
    `;
  }

  if (safeData.purpose) {
    summaryRowsHtml += `
      <tr>
        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600; vertical-align: top;">วัตถุประสงค์ / หมายเหตุ:</td>
        <td style="font-size: 13px; color: #334155; padding: 6px 0; line-height: 1.5; font-style: italic;">${safeData.purpose}</td>
      </tr>
    `;
  }

  // Construct Approval / Workflow Section (Section 5)
  let workflowHtml = '';
  if (safeData.approved_by || safeData.rejection_reason || safeData.override_reason) {
    workflowHtml = `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px; margin-bottom: 20px; background-color: #f1f5f9; border-radius: 10px; border-left: 4px solid ${statusType === 'danger' || statusType === 'rejected' ? '#ef4444' : '#10b981'}; padding: 14px 16px;">
        <tr>
          <td>
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 8px;">
              สถานะขั้นตอนการอนุมัติ (Workflow Summary)
            </div>
            ${safeData.approved_by ? `
              <div style="font-size: 13px; color: #0f172a; margin-bottom: 4px;">
                <strong>ผู้อนุมัติ:</strong> ${safeData.approved_by} ${safeData.approved_date ? `<span style="font-size: 11px; color: #64748b;">(${safeData.approved_date})</span>` : ''}
              </div>
            ` : ''}
            ${safeData.rejection_reason ? `
              <div style="font-size: 13px; color: #b91c1c; margin-top: 6px; padding: 8px 12px; background-color: #fee2e2; border-radius: 6px; border: 1px solid #fca5a5;">
                <strong>เหตุผลการปฏิเสธ:</strong> ${safeData.rejection_reason}
              </div>
            ` : ''}
            ${safeData.override_reason ? `
              <div style="font-size: 12px; color: #b45309; margin-top: 6px; padding: 6px 10px; background-color: #fef3c7; border-radius: 6px; border: 1px solid #fde68a;">
                <strong>หมายเหตุการอนุมัติพิเศษ:</strong> ${safeData.override_reason}
              </div>
            ` : ''}
          </td>
        </tr>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${resolveEmailVariables(template.subject || appName, safeData)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  
  <!-- Preheader Text for Inbox Preview -->
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: #ffffff;">
    ${preheaderText}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header Bar -->
          <tr>
            <td style="padding: 22px 32px; background-color: #ffffff; border-bottom: 3px solid ${accentColor};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${appName}" style="max-height: 36px; width: auto; display: block; border: 0;" />` : `<span style="font-size: 22px; font-weight: 800; color: ${accentColor}; letter-spacing: -0.5px;">${appName}</span>`}
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Inventory Management System</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                
                <!-- Status Badge Header -->
                <tr>
                  <td align="left" style="padding-bottom: 14px;">
                    ${getStatusBadgeHtml(statusType, statusLabel)}
                  </td>
                </tr>

                <!-- Heading Title -->
                <tr>
                  <td align="left" style="padding-bottom: 10px;">
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.35;">
                      ${heading}
                    </h1>
                  </td>
                </tr>

                <!-- Intro Message -->
                <tr>
                  <td align="left" style="padding-bottom: 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                    ${intro}
                  </td>
                </tr>

                <!-- Request Summary Card Table -->
                ${summaryRowsHtml ? `
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px;">
                      ${summaryRowsHtml}
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- Items Details Section (Section 3) -->
                ${itemsTableHtml ? `
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 8px;">
                      รายการวัสดุ (Material Details)
                    </div>
                    ${itemsTableHtml}
                  </td>
                </tr>
                ` : ''}

                <!-- Workflow Details Section (Section 5) -->
                ${workflowHtml ? `
                <tr>
                  <td>
                    ${workflowHtml}
                  </td>
                </tr>
                ` : ''}

                <!-- Primary CTA Button -->
                ${ctaLabel ? `
                <tr>
                  <td align="center" style="padding-top: 12px; padding-bottom: 20px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: ${accentColor};">
                          <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 12px 30px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; border: 1px solid ${accentColor}; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
                            ${ctaLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- Secondary Link Fallback (Section 14) -->
                ${ctaUrl && ctaUrl !== '#' ? `
                <tr>
                  <td align="center" style="padding-bottom: 20px; font-size: 12px; color: #64748b; line-height: 1.5;">
                    หากปุ่มด้านบนไม่ทำงาน สามารถเปิดดูรายละเอียดในระบบได้จากลิงก์นี้:<br />
                    <a href="${ctaUrl}" target="_blank" style="color: ${accentColor}; word-break: break-all; font-weight: 600;">${ctaUrl}</a>
                  </td>
                </tr>
                ` : ''}

                <!-- Footer Note -->
                <tr>
                  <td align="left" style="font-size: 12px; line-height: 1.5; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                    ${footerNote}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Email Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              © ${safeData.year} ${appName} · Inventory Management System
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Renders Clean, Minimal, Professional Test Email HTML matching StockFlow specifications
 */
export const renderTestEmailHtml = ({
  appName = 'StockFlow',
  isoTimestamp = new Date().toISOString()
}) => {
  const formattedTime = formatThaiDateTime(isoTimestamp);
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ทดสอบการเชื่อมต่ออีเมล — StockFlow</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Bar -->
          <tr>
            <td style="padding: 24px 32px 20px 32px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px;">${appName}</span>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 28px 32px 32px 32px;">
              
              <!-- Heading -->
              <h1 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                ทดสอบการเชื่อมต่ออีเมล — StockFlow
              </h1>

              <!-- Intro Paragraph -->
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                การส่งอีเมลทดสอบเชื่อมต่อระบบทำงานสำเร็จเรียบร้อยแล้ว
              </p>

              <!-- Server Timestamp Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0; padding: 14px 16px;">
                <tr>
                  <td style="font-size: 13px; color: #475569; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.5;">
                    <strong style="color: #0f172a; font-weight: 700;">เวลาทำรายการ:</strong> ${formattedTime}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #64748b;">
              © ${new Date().getFullYear()} ${appName} · Inventory Management System
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
