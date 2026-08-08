/**
 * StockFlow Transactional Email HTML Renderer
 * Production-safe, inline-styled, table-based HTML generator compatible with major email clients (Gmail, Outlook, Apple Mail).
 */

export const SAMPLE_EMAIL_DATA = {
  user_name: 'สมชาย ใจดี',
  user_email: 'somchai@stockflow.com',
  request_no: 'REQ-2026-0012',
  project_name: 'โครงการอาคารพาณิชย์ A (Sukhumvit 21)',
  request_date: '08/08/2026 14:30',
  status: 'อนุมัติแล้ว',
  item_count: '4 รายการ',
  total_quantity: '120 ชิ้น',
  approved_by: 'วิศวกรสมศักดิ์ (Supervisor)',
  rejection_reason: 'จำนวนวัสดุเกินเกณฑ์สำรองในคลังสินค้าประจำโครงการ',
  stock_in_no: 'RCV-2026-0089',
  item_name: 'สายไฟ NYY 4x16 sq.mm',
  current_stock: '5 ชิ้น',
  threshold: '10 ชิ้น',
  app_name: 'StockFlow',
  company_name: 'StockFlow Co., Ltd.',
  action_url: 'https://stockflow.app/withdrawals/REQ-2026-0012',
  year: new Date().getFullYear().toString()
};

export const SUPPORTED_EVENT_VARIABLES = {
  withdrawal_submitted: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{request_date}}', desc: 'วันที่ส่งคำขอ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูคำขอ' }
  ],
  withdrawal_approved: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{request_date}}', desc: 'วันที่อนุมัติ' },
    { code: '{{approved_by}}', desc: 'ผู้อนุมัติ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูรายละเอียด' }
  ],
  withdrawal_rejected: [
    { code: '{{user_name}}', desc: 'ชื่อผู้ขอเบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{rejection_reason}}', desc: 'เหตุผลการปฏิเสธ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูรายละเอียด' }
  ],
  withdrawal_completed: [
    { code: '{{user_name}}', desc: 'ชื่อผู้เบิก' },
    { code: '{{request_no}}', desc: 'เลขที่คำขอเบิก' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{action_url}}', desc: 'ลิงก์ประวัติการเบิก' }
  ],
  stock_in_created: [
    { code: '{{stock_in_no}}', desc: 'เลขที่ใปรับเข้า' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{item_count}}', desc: 'จำนวนรายการรับเข้า' },
    { code: '{{action_url}}', desc: 'ลิงก์ประวัติรับเข้า' }
  ],
  low_stock_alert: [
    { code: '{{item_name}}', desc: 'ชื่อวัสดุ' },
    { code: '{{current_stock}}', desc: 'จำนวนคงเหลือปัจจุบัน' },
    { code: '{{threshold}}', desc: 'เกณฑ์แจ้งเตือนสต็อกต่ำ' },
    { code: '{{project_name}}', desc: 'ชื่อโครงการ' },
    { code: '{{action_url}}', desc: 'ลิงก์เข้าดูคลังวัสดุ' }
  ]
};

/**
 * Replaces placeholders in text with sample or real data
 */
export const resolveEmailVariables = (text = '', data = SAMPLE_EMAIL_DATA) => {
  if (!text) return '';
  let result = text;
  Object.entries(data).forEach(([key, val]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, val ?? '');
  });
  return result;
};

/**
 * Returns HTML badge styling for status header
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
    <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
      ${label}
    </div>
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
  const appName = branding.app_name || data.app_name || 'StockFlow';
  const accentColor = branding.accent_color || '#3b82f6';
  const logoUrl = branding.logo_url || '';
  const footerText = branding.footer_text || 'หากคุณไม่ได้ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อความปลอดภัย';

  const heading = resolveEmailVariables(template.heading || 'คำแจ้งเตือนจากระบบ StockFlow', data);
  const intro = resolveEmailVariables(template.intro || 'มีรายการอัปเดตใหม่ในระบบ StockFlow ของคุณ', data);
  const ctaLabel = resolveEmailVariables(template.cta_label || 'ดูรายละเอียดในระบบ', data);
  const ctaUrl = resolveEmailVariables(template.cta_url || data.action_url || '#', data);
  const footerNote = resolveEmailVariables(template.footer_note || footerText, data);

  const statusLabel = template.status_label || data.status || 'รายการใหม่';
  const statusType = template.status_type || 'info';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${resolveEmailVariables(template.subject || appName, data)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header Bar -->
          <tr>
            <td style="padding: 24px 32px; background-color: #ffffff; border-bottom: 2px solid ${accentColor};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${appName}" style="max-height: 36px; width: auto; display: block; border: 0;" />` : `<span style="font-size: 22px; font-weight: 800; color: ${accentColor}; letter-spacing: -0.5px;">${appName}</span>`}
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Inventory Management System</span>
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
                  <td align="left" style="padding-bottom: 16px;">
                    ${getStatusBadgeHtml(statusType, statusLabel)}
                  </td>
                </tr>

                <!-- Heading Title -->
                <tr>
                  <td align="left" style="padding-bottom: 12px;">
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                      ${heading}
                    </h1>
                  </td>
                </tr>

                <!-- Intro Message -->
                <tr>
                  <td align="left" style="padding-bottom: 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                    ${intro}
                  </td>
                </tr>

                <!-- Details Card Table -->
                <tr>
                  <td style="padding-bottom: 24px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px;">
                      <tr>
                        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;" width="40%">โครงการ:</td>
                        <td style="font-size: 13px; color: #0f172a; padding: 6px 0; font-weight: 700;" width="60%">${data.project_name}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">เลขที่อ้างอิง:</td>
                        <td style="font-size: 13px; color: #0f172a; padding: 6px 0; font-weight: 700;">${data.request_no || data.stock_in_no}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">วันที่ทำรายการ:</td>
                        <td style="font-size: 13px; color: #334155; padding: 6px 0;">${data.request_date}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #64748b; padding: 6px 0; font-weight: 600;">สรุปรายการ:</td>
                        <td style="font-size: 13px; color: #334155; padding: 6px 0;">${data.item_count} (${data.total_quantity})</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Primary CTA Button -->
                ${ctaLabel ? `
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: ${accentColor}; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
                ` : ''}

                <!-- Footer Note -->
                <tr>
                  <td align="left" style="font-size: 12px; line-height: 1.5; color: #94a3b8; border-t: 1px solid #f1f5f9; padding-top: 16px;">
                    ${footerNote}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Email Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              © ${data.year} ${appName} · Inventory Management System
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
