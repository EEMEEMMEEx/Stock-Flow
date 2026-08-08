export const generateDeliveryNoteXML = (order, items, profile) => {
  const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return unsafe.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  let rowsHtml = '';
  let emsCount = 0;
  let officeCount = 0;

  items.forEach((item, index) => {
    const isEms = (item.delivery_to || '').toLowerCase().includes('ems');
    if (isEms) emsCount++;
    else officeCount++;

    const tagClass = isEms ? 'tag-ems' : 'tag-office';
    const tagLabel = isEms ? 'EMS' : 'Office';
    const serialPart = [item.serial_number, item.part_number].filter(Boolean).join(' / ');

    rowsHtml += `
      <tr>
        <td>${index + 1}</td>
        <td><div class="item-desc">${escapeHtml(item.items?.name || '')}</div></td>
        <td class="item-qty">${item.quantity || 0} <span style="font-size:0.75rem;font-weight:400;color:#6b6560">${escapeHtml(item.items?.unit || '')}</span></td>
        <td style="text-align:center"><span class="delivery-tag ${tagClass}">${tagLabel}</span></td>
        <td class="serial-cell">${escapeHtml(serialPart || '—')}</td>
      </tr>
    `;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif; padding: 2rem; color: #1a1a1a; line-height: 1.7; background: #fff; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
    .doc-ref { font-size: 0.9rem; color: #666; margin-bottom: 2rem; }
    .company-name-th { font-size: 1.15rem; font-weight: 700; }
    .company-name-en { font-size: 0.85rem; font-weight: 600; color: #6b6560; margin-bottom: 0.75rem; }
    .company-details { font-size: 0.88rem; color: #6b6560; margin-top: 0.5rem; }
    .detail-row { margin: 0.2rem 0; }
    .info-row { display: flex; gap: 2rem; margin: 1.5rem 0; }
    .info-card { flex: 1; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    .info-card-label { font-size: 0.75rem; font-weight: 600; color: #6b6560; text-transform: uppercase; margin-bottom: 0.3rem; }
    .info-card-value { font-size: 0.95rem; font-weight: 500; }
    .info-card-sub { font-size: 0.82rem; color: #6b6560; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th { background: #faf8f5; padding: 0.75rem 1rem; font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6560; text-align: left; border-bottom: 2px solid #d5d0c8; }
    td { padding: 0.85rem 1rem; font-size: 0.9rem; border-bottom: 1px solid #eee; }
    .item-desc { font-weight: 500; }
    .item-qty { text-align: center; font-weight: 700; }
    .delivery-tag { display: inline-block; padding: 0.2rem 0.7rem; border-radius: 50px; font-size: 0.75rem; font-weight: 600; }
    .tag-ems { background: rgba(41,128,185,0.1); color: #2980b9; }
    .tag-office { background: rgba(39,174,96,0.1); color: #27ae60; }
    .serial-cell { font-size: 0.82rem; color: #6b6560; }
    .remark-section { margin-top: 1.5rem; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    .remark-label { font-size: 0.78rem; font-weight: 600; color: #6b6560; margin-bottom: 0.3rem; }
    .remark-value { font-size: 0.9rem; font-style: italic; }
    .summary-bar { display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.85rem; font-weight: 500; }
    .chip-num { font-weight: 700; }
    .doc-footer { text-align: center; font-size: 0.78rem; color: #aaa; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>ใบนำส่งอุปกรณ์ (Delivery Note)</h1>
  <div class="doc-ref">เอกสารอ้างอิง: ${escapeHtml(order.id.split('-')[0].toUpperCase())} | วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}</div>
  
  <div style="border: 1px solid #ddd; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
    <div class="company-name-th">บริษัท ฟอร์ท คอร์ปอเรชัน จำกัด (มหาชน)</div>
    <div class="company-name-en">FORTH CORPORATION PUBLIC COMPANY LIMITED</div>
    <div class="company-details">
      <div class="detail-row">1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400</div>
      <div class="detail-row">โทร: 02-265-6700 | แฟกซ์: 02-265-6799</div>
      <div class="detail-row">เลขประจำตัวผู้เสียภาษี: 0107548000471</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-card">
      <div class="info-card-label">ผู้ส่งของ</div>
      <div class="info-card-value">${escapeHtml(profile?.full_name || '—')}</div>
    </div>
    <div class="info-card">
      <div class="info-card-label">ผู้รับของ</div>
      <div class="info-card-value">${escapeHtml(order.projects?.name || '—')}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>รวมทั้งหมด <span class="chip-num">${items.length}</span> รายการ</div>
    <div>EMS <span class="chip-num">${emsCount}</span> รายการ</div>
    <div>Office <span class="chip-num">${officeCount}</span> รายการ</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ลำดับ</th>
        <th>รายการ</th>
        <th style="text-align: center;">จำนวน</th>
        <th style="text-align: center;">ส่งที่</th>
        <th>S/N / P/N</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="remark-section">
    <div class="remark-label">หมายเหตุ (Remark)</div>
    <div class="remark-value">${escapeHtml(order.purpose || '—')}</div>
  </div>

  <div class="doc-footer">
    เอกสารฉบับนี้จัดทำโดยระบบอัตโนมัติ — Forth Corporation PCL.
  </div>
</body>
</html>
  `;

  return html;
};
