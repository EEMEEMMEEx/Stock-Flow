import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSampleEmailData,
  renderEmailHtml,
  renderEmailText,
  renderTestEmailHtml,
  renderUserInvitationEmailHtml,
  renderUserInvitationEmailText,
  resolveEmailVariables,
  SUPPORTED_EVENT_VARIABLES,
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
