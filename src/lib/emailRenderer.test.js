import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSampleEmailData,
  renderEmailHtml,
  renderEmailText,
  renderTestEmailHtml,
  renderUserInvitationEmailHtml,
  
  resolveEmailVariables,
  SUPPORTED_EVENT_VARIABLES,
  CHECKOUT_EVENT_TYPES,
  formatThaiDate,
  formatThaiDateOrDateTime,
  formatReturnCondition,
  buildCheckoutEmailItems,
  buildCheckoutEmailData,
} from './emailRenderer.js';

const EVENT_EXPECTATIONS = {
  withdrawal_submitted: {
    html: 'มีคำขอเบิกจ่ายวัสดุใหม่เข้าระบบ',
    text: 'WO-0B2C1F6C',
  },
  withdrawal_approved: {
    html: 'คำขอเบิกจ่ายวัสดุของคุณได้รับการอนุมัติแล้ว',
    text: 'Admin User',
  },
  withdrawal_rejected: {
    html: 'คำขอเบิกจ่ายวัสดุไม่ได้รับการอนุมัติ',
    text: 'WO-0B2C1F6C',
  },
  withdrawal_completed: {
    html: 'ดำเนินการจ่ายวัสดุเรียบร้อยแล้ว',
    text: 'WO-0B2C1F6C',
  },
  stock_in_created: {
    html: 'มีการรับวัสดุเข้าสต็อกเรียบร้อยแล้ว',
    text: 'SI-2026-00042',
  },
  low_stock_alert: {
    html: 'แจ้งเตือน.*ถึงจุดสั่งซื้อ',
    text: 'สายไฟ THW 1x2.5 sq.mm.',
  },
};

const SHARED_SHELL_MARKERS = [
  'INVENTORY MANAGEMENT SYSTEM',
  'max-width: 620px',
  'border-bottom: 3px solid',
  'border-left: 4px solid',
  'max-height: 0',
  'role="presentation"',
  'font-family: Arial, Tahoma',
];

test('renders all six notification types with the shared notification email shell', () => {
  Object.entries(EVENT_EXPECTATIONS).forEach(([eventType, expectation]) => {
    const html = renderEmailHtml({
      branding: { app_name: 'StockFlow QA', accent_color: '#2563eb' },
      template: { event_type: eventType },
      data: getSampleEmailData(eventType),
    });
    const text = renderEmailText({
      template: { event_type: eventType },
      data: getSampleEmailData(eventType),
    });

    SHARED_SHELL_MARKERS.forEach((marker) => {
      assert.ok(html.includes(marker), `${eventType} should include shared marker: ${marker}`);
    });
    assert.match(html, new RegExp(expectation.html));
    assert.match(text, new RegExp(expectation.text));
    assert.doesNotMatch(html, /{{\s*[\w.-]+\s*}}/);
    assert.doesNotMatch(text, /{{\s*[\w.-]+\s*}}/);
    assert.doesNotMatch(html, /<style\b/i);
    assert.doesNotMatch(html, /<script\b/i);
  });
});

test('keeps event-specific dynamic variables and plain-text fallback', () => {
  const template = {
    event_type: 'low_stock_alert',
    subject: '[StockFlow] {{item_code}} ต่ำกว่า {{threshold}}',
    heading: 'ตรวจสอบ {{item_name}}',
    intro: 'วัสดุเหลือ {{current_stock}} ใน {{warehouse_name}}',
    cta_label: 'เปิดรายการ {{item_code}}',
    cta_url: 'https://stockflowth.online/items',
    footer_note: 'แจ้งเตือนสำหรับ {{project_name}}',
  };
  const data = getSampleEmailData('low_stock_alert');
  const html = renderEmailHtml({ template, data });
  const text = renderEmailText({ template, data });

  assert.match(html, /THW-1X2\.5/);
  assert.match(html, /8 เมตร/);
  assert.match(html, /20 เมตร/);
  assert.match(text, /ตรวจสอบ สายไฟ THW 1x2\.5 sq\.mm\./);
  assert.match(text, /คลังกลาง กรุงเทพฯ/);
  assert.doesNotMatch(text, /<[^>]+>/);
  assert.doesNotMatch(text, /{{\s*[\w.-]+\s*}}/);
});

test('exposes the variables required by all six notification templates', () => {
  const requiredVariables = {
    withdrawal_submitted: ['request_no', 'project_name', 'purpose'],
    withdrawal_approved: ['approved_by', 'approved_date'],
    withdrawal_rejected: ['rejected_by', 'rejection_reason'],
    withdrawal_completed: ['completed_by', 'completed_date'],
    stock_in_created: ['stock_in_no', 'received_by', 'supplier_name', 'po_number'],
    low_stock_alert: ['item_name', 'item_code', 'current_stock', 'threshold', 'warehouse_name'],
  };

  Object.entries(requiredVariables).forEach(([eventType, variables]) => {
    const codes = SUPPORTED_EVENT_VARIABLES[eventType].map(({ code }) => code);
    variables.forEach((variable) => assert.ok(codes.includes(`{{${variable}}}`), `${eventType} should expose {{${variable}}}`));
  });
});

test('escapes user content while keeping safe inline HTML structure', () => {
  const html = renderEmailHtml({
    template: { event_type: 'withdrawal_rejected', heading: '<script>alert(1)</script>' },
    data: {
      ...getSampleEmailData('withdrawal_rejected'),
      rejection_reason: '<img src=x onerror=alert(1)>',
    },
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('renders clean RFC-compliant connectivity test email and user invitation', () => {
  assert.equal(resolveEmailVariables('คำขอ {{request_no}} {{unknown}}', { request_no: 'WO-101' }), 'คำขอ WO-101 ');
  
  const html = renderTestEmailHtml({ appName: 'StockFlow QA', isoTimestamp: 'Mon, 31 Aug 2026 10:00:00 GMT' });
  assert.ok(html.includes('แจ้งเตือนการทดสอบระบบอีเมล (StockFlow QA SMTP Test)'));
  assert.ok(html.includes('เวลาที่ส่ง:'));
  assert.ok(html.includes('Mon, 31 Aug 2026 10:00:00 GMT'));
  assert.ok(html.includes('สถานะ:'));
  assert.ok(html.includes('จัดส่งสำเร็จ'));
  // Ensure no mock withdrawal data
  assert.doesNotMatch(html, /สรุปคำขอเบิก/);
  assert.doesNotMatch(html, /WO-002C1F8C/);
  assert.doesNotMatch(html, /watchara@example\.com/);

  // Check invitation renderer adheres to zero-credential exposure
  const invitationHtml = renderUserInvitationEmailHtml({
    appName: 'StockFlow QA',
    userName: 'สมชาย ใจดี',
    userEmail: 'somchai@example.com',
    roleName: 'STAFF',
    projectAccessSummary: '2 โครงการ',
    actionUrl: 'https://stockflow.example.com',
  });
  assert.ok(invitationHtml.includes('แจ้งเปิดสิทธิ์การใช้งานระบบ StockFlow QA'));
  assert.ok(invitationHtml.includes('สมชาย ใจดี'));
  assert.doesNotMatch(invitationHtml, /Initial Access/);
  assert.doesNotMatch(invitationHtml, /F0rth2026@dtrs/);
});

// ---------------------------------------------------------------------------
// Checkout module (/checkouts) — events 7..13
// ---------------------------------------------------------------------------

const CHECKOUT_EVENT_EXPECTATIONS = {
  checkout_submitted: {
    template: { event_type: 'checkout_submitted' },
    html: ['มีคำขอยืมอุปกรณ์ใหม่เข้าระบบ', 'ASSET-DOPA-0482', 'รอการพิจารณาอนุมัติ'],
    text: ['CHK-2026-0089', 'วิทยุสื่อสารดิจิทัล Motorola XiR P8668i TIA'],
  },
  checkout_approved: {
    template: { event_type: 'checkout_approved' },
    html: ['คำขอยืมอุปกรณ์ของคุณได้รับการอนุมัติเรียบร้อยแล้ว', 'ประเสริฐ ชัยชนะ'],
    text: ['CHK-2026-0089'],
  },
  checkout_rejected: {
    template: { event_type: 'checkout_rejected' },
    html: ['คำขอยืมอุปกรณ์ไม่ได้รับการอนุมัติ', 'อุปกรณ์รุ่นนี้ถูกจัดสรรสำหรับงานฉุกเฉิน'],
    text: ['เหตุผลที่ไม่อนุมัติ'],
  },
  checkout_handed_over: {
    template: { event_type: 'checkout_handed_over' },
    html: ['Handover Receipt', 'กำหนดส่งคืน'],
    text: ['CHK-2026-0089'],
  },
  checkout_due_soon: {
    template: { event_type: 'checkout_due_soon' },
    html: ['Return Due Reminder', '9 ตุลาคม 2569'],
    text: ['กำหนดส่งคืน'],
  },
  checkout_overdue: {
    template: { event_type: 'checkout_overdue' },
    html: ['Overdue Notice', '3 วัน'],
    text: ['เกินกำหนด: 3 วัน'],
  },
  checkout_returned: {
    template: { event_type: 'checkout_returned' },
    html: ['รับคืนอุปกรณ์เรียบร้อยแล้ว', 'สภาพอุปกรณ์โดยรวม', 'ปกติ สมบูรณ์'],
    text: ['สภาพอุปกรณ์: ปกติ สมบูรณ์', '8 ตุลาคม 2569 เวลา 16:15 น.'],
  },
};

test('renders all seven checkout notification types with the shared shell', () => {
  assert.equal(CHECKOUT_EVENT_TYPES.length, 7);

  CHECKOUT_EVENT_TYPES.forEach((eventType) => {
    const expectation = CHECKOUT_EVENT_EXPECTATIONS[eventType];
    assert.ok(expectation, `${eventType} needs test expectations`);

    const data = getSampleEmailData(eventType);
    assert.equal(data.event_type, eventType, `${eventType} must resolve its own sample data`);

    const html = renderEmailHtml({ branding: { app_name: 'StockFlow QA' }, template: expectation.template, data });
    const text = renderEmailText({ template: expectation.template, data });

    SHARED_SHELL_MARKERS.forEach((marker) => {
      assert.ok(html.includes(marker), `${eventType} should include shared marker: ${marker}`);
    });
    expectation.html.forEach((marker) => {
      assert.ok(html.includes(marker), `${eventType} HTML should include: ${marker}`);
    });
    expectation.text.forEach((marker) => {
      assert.ok(text.includes(marker), `${eventType} text should include: ${marker}`);
    });

    assert.doesNotMatch(html, /{{\s*[\w.-]+\s*}}/);
    assert.doesNotMatch(text, /{{\s*[\w.-]+\s*}}/);
    assert.doesNotMatch(html, /<style\b/i);
    assert.doesNotMatch(html, /<script\b/i);
    assert.ok(html.includes('รายการอุปกรณ์ที่ยืม'), `${eventType} must render the equipment table`);
    assert.ok(html.includes('รหัสทรัพย์สิน:'), `${eventType} must label items as fixed assets`);
  });
});

test('keeps checkout sample data free of withdrawal material copy', () => {
  CHECKOUT_EVENT_TYPES.forEach((eventType) => {
    const html = renderEmailHtml({
      template: { event_type: eventType },
      data: getSampleEmailData(eventType),
    });
    assert.doesNotMatch(html, /สรุปคำขอเบิก/);
    assert.doesNotMatch(html, /WO-0B2C1F6C/);
    assert.doesNotMatch(html, /THW-1X2\.5/);
  });
});

test('exposes the variables required by all seven checkout templates', () => {
  const requiredVariables = {
    checkout_submitted: ['checkout_id', 'borrower_name', 'equipment_name', 'asset_code', 'due_date'],
    checkout_approved: ['checkout_id', 'approver_name', 'due_date'],
    checkout_rejected: ['checkout_id', 'reject_reason'],
    checkout_handed_over: ['checkout_id', 'due_date', 'quantity'],
    checkout_due_soon: ['checkout_id', 'due_date'],
    checkout_overdue: ['checkout_id', 'days_overdue'],
    checkout_returned: ['checkout_id', 'return_date', 'condition'],
  };

  Object.entries(requiredVariables).forEach(([eventType, variables]) => {
    const codes = SUPPORTED_EVENT_VARIABLES[eventType].map(({ code }) => code);
    variables.forEach((variable) => {
      assert.ok(codes.includes(`{{${variable}}}`), `${eventType} should expose {{${variable}}}`);
    });
  });
});

test('escapes user supplied checkout content (XSS) in HTML output', () => {
  const html = renderEmailHtml({
    template: {
      event_type: 'checkout_returned',
      heading: '<script>alert(1)</script>',
      intro: 'สภาพ: {{condition}}',
    },
    data: {
      ...getSampleEmailData('checkout_returned'),
      condition: '<img src=x onerror=alert(1)>',
      condition_details: '</td></tr><script>alert(2)</script>',
    },
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('formats checkout calendar dates without inventing a time', () => {
  assert.equal(formatThaiDate('2026-10-09'), '9 ตุลาคม 2569');
  assert.equal(formatThaiDateOrDateTime('2026-10-09'), '9 ตุลาคม 2569');
  assert.match(formatThaiDateOrDateTime('2026-10-09T09:15:00.000Z'), /^9 ตุลาคม 2569 เวลา 16:15 น\.$/);
  assert.equal(formatThaiDate(''), '');
  assert.equal(formatThaiDate('not-a-date'), 'not-a-date');
});

test('maps return condition codes to Thai labels', () => {
  assert.equal(formatReturnCondition('normal'), 'ปกติ (สมบูรณ์พร้อมใช้งาน)');
  assert.equal(formatReturnCondition('damaged'), 'ชำรุด (ต้องซ่อมแซม)');
  assert.equal(formatReturnCondition('needs_repair'), 'ต้องซ่อมแซม');
  assert.equal(formatReturnCondition('lost'), 'สูญหาย');
  assert.equal(formatReturnCondition('weird_code'), 'weird_code');
  assert.equal(formatReturnCondition(''), '-');
});

test('normalizes checkout items from DB rows and POS payload rows', () => {
  const dbRows = buildCheckoutEmailItems([
    {
      quantity_borrowed: 2,
      quantity_returned: 0,
      serial_number: '78945612',
      items: { name: 'วิทยุสื่อสาร', sku: 'ASSET-DOPA-0482', unit: 'เครื่อง' },
    },
  ], { dueDate: '9 ตุลาคม 2569' });

  assert.equal(dbRows.length, 1);
  assert.equal(dbRows[0].name, 'วิทยุสื่อสาร');
  assert.equal(dbRows[0].asset_code, 'ASSET-DOPA-0482 (S/N: 78945612)');
  assert.equal(dbRows[0].requested_qty, 2);
  assert.equal(dbRows[0].due_date, '9 ตุลาคม 2569');

  const posRows = buildCheckoutEmailItems([
    { item_id: 'abc', quantity: 3, item_name: 'แท่นชาร์จ', serial_number: null },
  ]);
  assert.equal(posRows.length, 1);
  assert.equal(posRows[0].name, 'แท่นชาร์จ');
  assert.equal(posRows[0].requested_qty, 3);
  assert.deepEqual(buildCheckoutEmailItems(null), []);
});

test('builds a complete checkout email payload from an order row', () => {
  const emailData = buildCheckoutEmailData({
    eventType: 'checkout_overdue',
    order: {
      id: '11111111-2222-3333-4444-555555555555',
      order_number: 'CHK-2026-0090',
      borrower_name: 'วัชระ มานะดี',
      borrower_department: 'Network',
      expected_return_date: '2026-10-01',
      borrow_type: 'standard',
    },
    project: { name: 'DTRS-DOPA', project_code: 'DTRS-DOPA-02' },
    items: [{ name: 'วิทยุ', sku: 'ASSET-1', unit: 'เครื่อง', requested_qty: 2 }],
    status: 'เกินกำหนดส่งคืน',
    daysOverdue: '3 วัน',
    publicBaseUrl: 'https://stockflowth.online/',
  });

  assert.equal(emailData.checkout_id, 'CHK-2026-0090');
  assert.equal(emailData.request_no, 'CHK-2026-0090');
  assert.equal(emailData.borrower_name, 'วัชระ มานะดี');
  assert.equal(emailData.project_name, 'DTRS-DOPA');
  assert.equal(emailData.due_date, '1 ตุลาคม 2569');
  assert.equal(emailData.days_overdue, '3 วัน');
  assert.equal(emailData.quantity, '2 เครื่อง');
  assert.equal(emailData.action_url, 'https://stockflowth.online/checkouts?order_id=CHK-2026-0090');

  // Every advertised variable must resolve against the generated payload
  const rendered = renderEmailHtml({
    template: {
      event_type: 'checkout_overdue',
      subject: '{{checkout_id}} {{days_overdue}} {{due_date}} {{unknown_key}}',
      heading: '{{borrower_name}} — {{project_name}}',
      intro: '{{equipment_name}} ({{asset_code}}) จำนวน {{quantity}}',
      footer_note: '{{public_base_url}}',
    },
    data: emailData,
  });
  assert.doesNotMatch(rendered, /{{\s*[\w.-]+\s*}}/);
  assert.ok(rendered.includes('CHK-2026-0090'));
  assert.ok(rendered.includes('วัชระ มานะดี'));
  assert.ok(rendered.includes('3 วัน'));
});

// ---------------------------------------------------------------------------
// Global Email Branding — logo, accent colour and URL normalisation
// ---------------------------------------------------------------------------

test('renders the self-hosted logo and accent colour in event and invitation HTML', () => {
  const branding = {
    app_name: 'StockFlow QA',
    accent_color: '#3b82f6',
    logo_url: 'stockflowth.online/images/logo.png', // scheme-less input must be repaired
  };

  const eventHtml = renderEmailHtml({
    branding,
    template: { event_type: 'withdrawal_submitted' },
    data: getSampleEmailData('withdrawal_submitted'),
  });
  assert.match(eventHtml, /<img src="https:\/\/stockflowth\.online\/images\/logo\.png"/);
  assert.ok(eventHtml.includes('#3b82f6'));

  // Bug #6: the invitation template used to render text only
  const invitationHtml = renderUserInvitationEmailHtml({
    appName: 'StockFlow',
    userName: 'QA User',
    userEmail: 'qa@stockflowth.online',
    roleName: 'STAFF',
    projectAccessSummary: '1 project',
    actionUrl: 'https://stockflowth.online/',
    branding,
  });
  assert.match(invitationHtml, /<img src="https:\/\/stockflowth\.online\/images\/logo\.png"/);
  assert.ok(invitationHtml.includes('#3b82f6'));

  // A cleared logo falls back to the asset shipped in public/images/
  const fallbackHtml = renderEmailHtml({
    branding: { ...branding, logo_url: '' },
    template: { event_type: 'withdrawal_submitted' },
    data: getSampleEmailData('withdrawal_submitted'),
  });
  assert.match(fallbackHtml, /<img src="https:\/\/stockflowth\.online\/images\/logo\.png"/);

  // An unusable logo URL must never be emitted as a broken <img>
  const brokenLogoHtml = renderEmailHtml({
    branding: { ...branding, logo_url: 'ftp://files.example.com/logo.png' },
    template: { event_type: 'withdrawal_submitted' },
    data: getSampleEmailData('withdrawal_submitted'),
  });
  assert.doesNotMatch(brokenLogoHtml, /ftp:/);
});
