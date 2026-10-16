#!/usr/bin/env node
/**
 * UI verification for the Partial Damage & Component Repair flow (migration 82)
 *   npm run verify:damaged-repair-ui
 *
 * ขับ Chrome/Edge ที่ติดตั้งในเครื่องผ่าน DevTools Protocol (ไม่เพิ่ม dependency)
 * ตามแบบเดียวกับ scripts/verify-consumed-ui.mjs
 *
 * READ-ONLY: ไม่มีการบันทึกผลการซ่อมจริง
 *   - ปุ่ม submit ถูกทดสอบเฉพาะกรณี "ยังไม่ได้ apply migration 82" (RPC ไม่มีบนฐานข้อมูล)
 *     เพื่อยืนยันข้อความแจ้งเตือนที่ถูกต้อง — ถ้าพบว่า RPC มีอยู่แล้ว จะข้ามการกด submit ทันที
 *
 * เตรียม: 1) npm run dev (http://localhost:5173)  2) .env.local -> E2E_EMAIL / E2E_PASSWORD
 * Artifacts: test-results/damaged-repair-ui/*.png
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// dotenv ตัดค่าที่มี '#' — อ่านบรรทัดดิบเพื่อให้รหัสผ่านไม่ถูกตัด
function readLocalValue(key) {
  try {
    const line = fs.readFileSync('.env.local', 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    if (!line) return '';
    let value = line[1].replace(/\s+$/, '');
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  } catch {
    return '';
  }
}

const BASE_URL = process.env.E2E_BASE_URL || readLocalValue('E2E_BASE_URL') || 'http://localhost:5173';
const EMAIL = readLocalValue('E2E_EMAIL') || process.env.E2E_EMAIL || '';
const PASSWORD = readLocalValue('E2E_PASSWORD') || process.env.E2E_PASSWORD || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9334);
const OUT_DIR = path.resolve('test-results/damaged-repair-ui');
const PROFILE_DIR = path.join(OUT_DIR, 'chrome-profile');
const CASE_ORDER = 'CHK-202610-3252';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const consoleErrors = [];
const rpcCalls = [];
const skipped = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' — ' + detail : ''));
}
const skip = (name, reason) => {
  skipped.push({ name, reason });
  console.log('[SKIP] ' + name + ' — ' + reason);
};

const CHROME_CANDIDATES = [
  process.env.E2E_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  on(method, fn) {
    const list = this.listeners.get(method) || [];
    list.push(fn);
    this.listeners.set(method, list);
  }
  send(method, params) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function waitForCdpUrl() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('DevTools endpoint did not appear on port ' + CDP_PORT);
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('CDP socket error')));
  });
}

// RPC มีบนฐานข้อมูลแล้วหรือยัง (ถ้ามี = ห้ามกด submit เด็ดขาด เพราะจะเขียนสต็อกจริง)
async function probeRpcExists() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/resolve_damaged_return_item', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_payload: {} }),
    });
    const body = await res.text();
    if (body.includes('Could not find the function') || body.includes('PGRST202')) return false;
    return true;
  } catch {
    return null;
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Missing E2E_EMAIL / E2E_PASSWORD (put them in .env.local — gitignored).');
    process.exit(2);
  }

  await fsp.mkdir(OUT_DIR, { recursive: true });

  let health;
  try {
    health = await fetch(BASE_URL);
  } catch {
    console.error('Dev server is not reachable at ' + BASE_URL + ' — run "npm run dev" first.');
    process.exit(2);
  }
  console.log('Dev server: HTTP ' + health.status + ' @ ' + BASE_URL);

  const rpcExists = await probeRpcExists();
  console.log('RPC resolve_damaged_return_item exists: ' + String(rpcExists));

  const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chromePath) {
    console.error('No Chrome/Edge binary found. Set E2E_CHROME to its path.');
    process.exit(2);
  }
  console.log('Browser: ' + chromePath);

  const browser = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + PROFILE_DIR,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let cdp;
  try {
    const wsUrl = await waitForCdpUrl();
    const ws = await openSocket(wsUrl);
    cdp = new Cdp(ws);

    cdp.on('Runtime.exceptionThrown', (p) => {
      consoleErrors.push(p.exceptionDetails && p.exceptionDetails.exception
        ? p.exceptionDetails.exception.description
        : String((p.exceptionDetails && p.exceptionDetails.text) || 'unknown exception'));
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') consoleErrors.push(p.entry.text);
    });
    cdp.on('Network.requestWillBeSent', (p) => {
      const url = (p.request && p.request.url) || '';
      // CORS preflight (OPTIONS) จะถูกนับด้วย — เก็บเฉพาะ POST ที่เป็นการเรียกจริง
      if (url.includes('/rpc/resolve_damaged_return_item') && p.request.method === 'POST') rpcCalls.push(p.request.method + ' ' + url);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    const evaluate = async (expression) => {
      const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (res.exceptionDetails) {
        throw new Error('page error: ' + ((res.exceptionDetails.exception && res.exceptionDetails.exception.description) || res.exceptionDetails.text));
      }
      return res.result ? res.result.value : undefined;
    };

    const waitFor = async (expression, label, timeout) => {
      const deadline = Date.now() + (timeout || 20000);
      while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return true; } catch { /* keep polling */ }
        await sleep(250);
      }
      throw new Error('timeout waiting for ' + (label || expression));
    };

    const setViewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 500,
    });

    const shot = async (name) => {
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(path.join(OUT_DIR, name), Buffer.from(res.data, 'base64'));
    };

    const goto = async (route) => {
      await cdp.send('Page.navigate', { url: BASE_URL + route });
      await waitFor("document.readyState === 'complete'", 'document ready ' + route);
      await sleep(900);
    };

    const bodyHas = (regexSource) => "new RegExp(" + JSON.stringify(regexSource) + ").test(document.body.innerText)";

    // ------------------------------------------------------------- login
    await setViewport(1440, 900);
    await goto('/login');
    await waitFor("!!document.querySelector('input[type=email]')", 'login form');
    // บังคับภาษาไทย: headless browser มักรายงาน navigator.language = en-US ทำให้ข้อความ UI เป็นอังกฤษ
    await evaluate("localStorage.setItem('stockflow.app.lang', 'th'); true");
    await goto('/login');
    await waitFor("!!document.querySelector('input[type=email]')", 'login form (th)');
    await evaluate("(() => {" +
      "const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };" +
      "set(document.querySelector('input[type=email]'), " + JSON.stringify(EMAIL) + ");" +
      "set(document.querySelector('input[type=password]'), " + JSON.stringify(PASSWORD) + ");" +
      "document.querySelector('form').requestSubmit();" +
      "return true; })()");
    try {
      await waitFor("location.pathname !== '/login' && Object.keys(localStorage).some((k) => k.indexOf('-auth-token') !== -1)", 'authenticated session', 25000);
      record('login', true, 'session established');
    } catch (err) {
      await shot('00-login-failed.png');
      record('login', false, err.message);
      throw err;
    }

    // ------------------------------------------- history -> detail modal
    await setViewport(1440, 900);
    await goto('/checkouts?tab=history');
    try {
      await waitFor("location.pathname === '/checkouts' && document.body.innerText.length > 200", 'checkouts page', 45000);
    } catch (err) {
      const dump = await evaluate("location.pathname + ' :: ' + document.body.innerText.slice(0, 300)");
      await shot('00-checkouts-page-timeout.png');
      record('เปิดหน้า /checkouts?tab=history ได้', false, String(dump));
      throw err;
    }
    record('เปิดหน้า /checkouts?tab=history ได้', true, await evaluate("location.pathname + location.search"));
    await sleep(1500);

    try {
      await waitFor("!!Array.from(document.querySelectorAll('input')).find((el) => /ค้นหาประวัติ/.test(el.placeholder || ''))", 'history search box', 60000);
    } catch (err) {
      const dump = await evaluate("document.body.innerText.slice(0, 400)");
      await shot('00-history-list-timeout.png');
      record('ประวัติการยืม-คืนโหลดเสร็จ (มีช่องค้นหา)', false, String(dump));
      throw err;
    }

    const searched = await evaluate("(() => {" +
      "const input = Array.from(document.querySelectorAll('input')).find((el) => /ค้นหาประวัติ/.test(el.placeholder || ''));" +
      "if (!input) return false;" +
      "const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;" +
      "s.call(input, " + JSON.stringify(CASE_ORDER) + ");" +
      "input.dispatchEvent(new Event('input', { bubbles: true }));" +
      "return true; })()");
    record('history search box accepts the case order', searched);
    await sleep(1200);

    const openedDetail = await evaluate("(() => {" +
      "const buttons = Array.from(document.querySelectorAll('button')).filter((el) => /ดูรายละเอียด/.test(el.textContent || ''));" +
      "if (!buttons.length) return false; buttons[0].click(); return true; })()");
    record('detail modal opened from history row', openedDetail);
    await waitFor(bodyHas('ประวัติการยืม-คืน') + " && !!document.querySelector('[role=dialog]')", 'detail dialog', 20000);
    await sleep(800);

    const repairButtons = await evaluate("Array.from(document.querySelectorAll('button')).filter((el) => /ซ่อมเสร็จ/.test(el.textContent || '')).length");
    record('รายการชำรุดมีปุ่ม "บันทึกซ่อมเสร็จ / คืนคลัง"', repairButtons > 0, 'found=' + repairButtons);
    const pendingBadge = await evaluate(bodyHas('รอจัดการซ่อม'));
    record('แสดงสถานะ "รอจัดการซ่อม" ของรายการที่ยังไม่จัดการ', pendingBadge);
    const caimButtons = await evaluate("Array.from(document.querySelectorAll('button')).filter((el) => /ส่งเคลม CAIM/.test(el.textContent || '')).length");
    record('รายการชำรุดมีปุ่ม "ส่งเคลม CAIM"', caimButtons > 0, 'found=' + caimButtons);
    await shot('01-detail-damaged-row-1440.png');

    if (repairButtons === 0) {
      throw new Error('ไม่พบปุ่มบันทึกซ่อมเสร็จ — ตรวจการแสดงผลรายการชำรุดก่อน');
    }

    // --------------------------------------------------- repair resolution modal
    await evaluate("(() => { const btn = Array.from(document.querySelectorAll('button')).find((el) => /ซ่อมเสร็จ/.test(el.textContent || '')); btn.click(); return true; })()");
    await waitFor(bodyHas('บันทึกผลการซ่อม / คืนอุปกรณ์เข้าคลัง'), 'repair modal title', 15000);
    await sleep(600);
    record('โมดอลบันทึกผลการซ่อมเปิดขึ้น', true);

    const modes = await evaluate("['ซ่อมเสร็จ / คืนเข้าคลัง', 'แยกอะไหล่เก็บไว้ใช้', 'แทงจำหน่าย'].filter((label) => document.body.innerText.includes(label)).length");
    record('มีแนวทางจัดการครบ 3 แนวทาง', modes === 3, 'found=' + modes);

    const projectSelect = await evaluate("(() => {" +
      "const select = document.getElementById('repair-project');" +
      "if (!select) return null;" +
      "return { options: select.options.length, value: select.value ? 'set' : 'empty' }; })()");
    record('มีตัวเลือกคลัง/โครงการปลายทาง และถูกเลือกไว้ก่อน', Boolean(projectSelect) && projectSelect.options > 1 && projectSelect.value === 'set',
      JSON.stringify(projectSelect));

    const quantityMax = await evaluate("(() => { const el = document.getElementById('repair-quantity'); return el ? el.max : null; })()");
    record('จำนวนที่จัดการถูกจำกัดด้วยยอดที่รับคืนไว้', quantityMax === '1', 'max=' + quantityMax);

    const notesRequired = await evaluate("(() => { const el = document.getElementById('repair-notes'); return el ? el.required : null; })()");
    record('ช่องรายละเอียดการซ่อมเป็นฟิลด์บังคับ', notesRequired === true);

    const spareToggle = await evaluate("document.body.innerText.includes('ตัดสต็อกอะไหล่ย่อยจากคลังที่เลือก')");
    record('มี toggle ตัดสต็อกอะไหล่ย่อย', spareToggle);

    // constraint validation: ห้าม submit เมื่อยังไม่กรอกรายละเอียดการซ่อม
    await evaluate("(() => { const btn = Array.from(document.querySelectorAll('button[type=submit]')).find((el) => /ยืนยันซ่อมเสร็จ/.test(el.textContent || '')); if (btn) btn.click(); return true; })()");
    await sleep(1000);
    const callCountAfterInvalid = rpcCalls.length;
    const modalStillOpen = await evaluate(bodyHas('บันทึกผลการซ่อม / คืนอุปกรณ์เข้าคลัง'));
    record('ไม่ส่งคำขอเมื่อยังไม่กรอกรายละเอียด (form validation)', callCountAfterInvalid === 0 && modalStillOpen,
      'rpcCalls=' + callCountAfterInvalid + ' modalOpen=' + modalStillOpen);

    // สลับเป็น "แทงจำหน่าย" ต้องเห็นตัวเลือกวิธีจำหน่าย + คำเตือนว่าไม่คืนสต็อก
    await evaluate("(() => { const btn = Array.from(document.querySelectorAll('button')).find((el) => /แทงจำหน่าย/.test(el.textContent || '')); btn.click(); return true; })()");
    await sleep(500);
    const disposalShown = await evaluate("!!document.getElementById('repair-disposal') && new RegExp('จะไม่ถูกคืนเข้าสต็อก').test(document.body.innerText)");
    record('โหมดแทงจำหน่ายแสดงวิธีจำหน่าย + คำเตือนว่าไม่คืนสต็อก', disposalShown);
    await shot('02-repair-modal-scrap-1440.png');

    await evaluate("(() => { const btn = Array.from(document.querySelectorAll('button')).find((el) => /ซ่อมเสร็จ \\/ คืนเข้าคลัง/.test(el.textContent || '')); btn.click(); return true; })()");
    await sleep(500);

    // ------------------------------------------- responsive / overflow guard
    const modalMetrics = async () => evaluate("(() => {" +
      "const dlg = Array.from(document.querySelectorAll('[role=dialog]')).find((el) => /บันทึกผลการซ่อม/.test(el.innerText || ''));" +
      "if (!dlg) return null;" +
      "const r = dlg.getBoundingClientRect();" +
      "const tag = document.documentElement;" +
      "return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width)," +
      " vw: window.innerWidth, pageScrollWidth: tag.scrollWidth, bodyScrollWidth: document.body.scrollWidth }; })()");

    const submitReach = async () => evaluate("(() => {" +
      "const dlg = Array.from(document.querySelectorAll('[role=dialog]')).find((el) => /บันทึกผลการซ่อม/.test(el.innerText || ''));" +
      "if (!dlg) return null;" +
      "const scroller = dlg.querySelector('.overflow-y-auto');" +
      "if (scroller) scroller.scrollTop = scroller.scrollHeight;" +
      "const btn = dlg.querySelector('button[type=submit]');" +
      "if (!btn) return null;" +
      "const r = btn.getBoundingClientRect();" +
      "return { bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width)," +
      " vh: window.innerHeight, cursor: getComputedStyle(btn).cursor, scrollableBody: !!scroller }; })()");

    for (const [width, height, label] of [[1440, 900, '1440'], [1024, 800, '1024'], [768, 900, '768'], [375, 900, '375']]) {
      await setViewport(width, height);
      await sleep(700);
      const metrics = await modalMetrics();
      record('ไม่ล้นแนวนอนที่ ' + label + 'px (โมดอลอยู่ในกรอบ viewport)',
        Boolean(metrics) && metrics.left >= 0 && metrics.right <= metrics.vw + 1 &&
        metrics.pageScrollWidth <= metrics.vw + 1 && metrics.bodyScrollWidth <= metrics.vw + 1,
        JSON.stringify(metrics));
      const reach = await submitReach();
      record('ปุ่มยืนยันซ่อมเสร็จเข้าถึงได้ที่ ' + label + 'px',
        Boolean(reach) && reach.bottom <= reach.vh + 1 && reach.height >= 36 && reach.cursor === 'pointer' && reach.scrollableBody,
        JSON.stringify(reach));
      await shot('03-responsive-' + label + '.png');
    }

    await evaluate("document.documentElement.classList.add('dark'); true");
    await sleep(600);
    await shot('04-repair-modal-375-dark.png');
    await evaluate("document.documentElement.classList.remove('dark'); true");
    await setViewport(1440, 900);
    await sleep(500);

    // ปิดโมดอลด้วยปุ่มยกเลิก ต้องไม่มีการเรียก RPC
    // ต้อง scope อยู่ในโมดอลซ่อมเท่านั้น: ปุ่ม "ยกเลิก" ของแถวประวัติ (SUPER cancel) มีข้อความเหมือนกัน
    const cancelClicked = await evaluate("(() => {" +
      "const dlg = Array.from(document.querySelectorAll('[role=dialog]')).find((el) => /บันทึกผลการซ่อม/.test(el.innerText || ''));" +
      "if (!dlg) return false;" +
      "const btn = Array.from(dlg.querySelectorAll('button')).find((el) => (el.textContent || '').trim() === 'ยกเลิก');" +
      "if (!btn) return false; btn.click(); return true; })()");
    let closed = false;
    try {
      await waitFor("!new RegExp('บันทึกผลการซ่อม / คืนอุปกรณ์เข้าคลัง').test(document.body.innerText)", 'repair modal closed', 8000);
      closed = true;
    } catch {
      const dump = await evaluate("Array.from(document.querySelectorAll('[role=dialog]')).map((el) => (el.innerText || '').slice(0, 60)).join(' || ')");
      await shot('06-close-failed.png');
      record('ปิดโมดอลได้โดยไม่ส่งข้อมูล', false, 'cancelClicked=' + cancelClicked + ' dialogs=' + String(dump).slice(0, 160));
    }
    if (closed) record('ปิดโมดอลได้โดยไม่ส่งข้อมูล', rpcCalls.length === 0, 'rpcCalls=' + rpcCalls.length);

    // ------------------------------------- graceful degradation (ก่อน apply)
    if (rpcExists === false) {
      const reopened = await evaluate("(() => { const btn = Array.from(document.querySelectorAll('button')).find((el) => /ซ่อมเสร็จ/.test(el.textContent || '')); if (!btn) return false; btn.click(); return true; })()");
      if (reopened) {
        await waitFor(bodyHas('บันทึกผลการซ่อม / คืนอุปกรณ์เข้าคลัง'), 'repair modal reopened', 15000);
        await evaluate("(() => {" +
          "const el = document.getElementById('repair-notes');" +
          "const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;" +
          "s.call(el, 'E2E: ตรวจข้อความแจ้งเตือนเมื่อยังไม่ติดตั้ง migration 82');" +
          "el.dispatchEvent(new Event('input', { bubbles: true }));" +
          "const btn = Array.from(document.querySelectorAll('button[type=submit]')).find((el2) => /ยืนยันซ่อมเสร็จ/.test(el2.textContent || ''));" +
          "btn.click(); return true; })()");
        try {
          await waitFor(bodyHas('ยังไม่ได้ติดตั้ง migration 82'), 'migration-missing toast', 15000);
          record('กรณี RPC ยังไม่มี: แสดงข้อความ "ยังไม่ได้ติดตั้ง migration 82"', true);
          record('ไม่มีการบันทึกข้อมูลจริง (RPC ตอบ 404)', rpcCalls.length > 0, 'rpcCalls=' + rpcCalls.length);
        } catch (err) {
          record('กรณี RPC ยังไม่มี: แสดงข้อความ "ยังไม่ได้ติดตั้ง migration 82"', false, err.message);
        }
        await shot('05-migration-missing-toast.png');
      } else {
        skip('graceful degradation', 'เปิดโมดอลซ้ำไม่สำเร็จ');
      }
    } else if (rpcExists === true) {
      skip('graceful degradation', 'RPC ถูก apply แล้ว — ข้ามการกด submit เพื่อไม่ให้เกิดการตัด/เพิ่มสต็อกจริง');
    } else {
      skip('graceful degradation', 'ตรวจสถานะ RPC ไม่ได้ (ไม่มี service role key)');
    }

    // 404 ของ RPC เป็นพฤติกรรมที่คาดไว้เมื่อยังไม่ apply migration 82 (ทดสอบ graceful degradation)
    const unexpectedErrors = consoleErrors.filter((text) => !(
      rpcExists === false && /status of 404|404 \(Not Found\)/i.test(text)
    ) && !/favicon/i.test(text));
    record('ไม่มีความผิดพลาดอื่นใน console ระหว่างการทดสอบ UI', unexpectedErrors.length === 0,
      unexpectedErrors.slice(0, 3).join(' | ').slice(0, 200));
  } finally {
    if (cdp) cdp.close();
    try { browser.kill(); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------- report
  const failed = results.filter((r) => !r.pass);
  console.log('==================================================================');
  console.log('   Partial damage repair — UI verification                         ');
  console.log('==================================================================');
  console.log('Total: ' + results.length + ' cases, failed: ' + failed.length + ', skipped: ' + skipped.length);
  console.log('Artifacts: ' + path.relative(process.cwd(), OUT_DIR));
  if (failed.length) {
    console.error('[FAIL] UI ของระบบซ่อมคืนสภาพยังไม่ผ่านการตรวจสอบ');
    process.exit(1);
  }
  console.log('[PASS] UI ของระบบซ่อมคืนสภาพทำงานตามที่ออกแบบ');
}

main().catch((err) => {
  console.error('[ERROR] ' + (err && err.message ? err.message : err));
  process.exit(1);
});
