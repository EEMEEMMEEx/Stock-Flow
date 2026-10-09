#!/usr/bin/env node
/**
 * Zero-dependency UI verification for the "consumed" (นำไปใช้งานทดแทน) checkout flow.
 *
 * Drives the locally installed Chrome/Edge over the DevTools Protocol, so no
 * Playwright/Puppeteer dependency is added. READ-ONLY: it never submits a return —
 * the submit path is deliberately blocked by the mandatory-reason validation, and
 * the run asserts that NO process_return_order RPC was sent.
 *
 * Setup:
 *   1) npm run dev                                (http://localhost:5173)
 *   2) .env.local -> E2E_EMAIL / E2E_PASSWORD     (gitignored)
 *   3) npm run verify:consumed-ui
 *
 * Artifacts: test-results/consumed-ui/*.png (+ the exported .xlsx when available)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';

dotenv.config({ path: '.env' });

/**
 * Read a value straight from the .env.local line.
 * dotenv treats an unquoted '#' as the start of a comment, so a password containing
 * '#' gets silently truncated (observed: 15 chars -> 1 char). Reading the raw line
 * (and unwrapping optional quotes) keeps the real secret intact.
 */
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
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9333);
const OUT_DIR = path.resolve('test-results/consumed-ui');
const PROFILE_DIR = path.join(OUT_DIR, 'chrome-profile');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const shots = [];
const consoleErrors = [];
const rpcCalls = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' — ' + detail : ''));
}

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

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Missing E2E_EMAIL / E2E_PASSWORD (put them in .env.local — gitignored).');
    process.exit(2);
  }
  console.log('Credentials: email ' + EMAIL.length + ' chars, password ' + PASSWORD.length + ' chars');

  await fsp.mkdir(OUT_DIR, { recursive: true });

  let health;
  try {
    health = await fetch(BASE_URL);
  } catch (err) {
    console.error('Dev server is not reachable at ' + BASE_URL + ' — run "npm run dev" first.');
    process.exit(2);
  }
  console.log('Dev server: HTTP ' + health.status + ' @ ' + BASE_URL);

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
      if (url.includes('/rpc/process_return_order')) rpcCalls.push(p.request.method + ' ' + url);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    try {
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT_DIR, eventsEnabled: true });
    } catch {
      try { await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT_DIR }); } catch { /* optional */ }
    }

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
      const file = path.join(OUT_DIR, name);
      await fsp.writeFile(file, Buffer.from(res.data, 'base64'));
      shots.push(path.relative(process.cwd(), file));
      return file;
    };

    const goto = async (route) => {
      await cdp.send('Page.navigate', { url: BASE_URL + route });
      await waitFor("document.readyState === 'complete'", 'document ready ' + route);
      await sleep(900);
    };

    // ---------------------------------------------------------------- login
    await setViewport(1440, 900);
    await goto('/login');
    await waitFor("!!document.querySelector('input[type=email]')", 'login form');
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

    // ------------------------------------------------------------- reports
    await setViewport(1440, 900);
    await goto('/reports');
    await waitFor("document.body.innerText.length > 200", 'reports page');

    // Buttons only: the sidebar navigation items are <a> and also contain "Withdrawals",
    // which previously hijacked this click and navigated away from /reports.
    await waitFor("Array.from(document.querySelectorAll('button')).some((el) => /withdraw|เบิก/i.test(el.textContent || ''))", 'reports tab bar', 25000);
    const tabClicked = await evaluate("(() => {" +
      "const tab = Array.from(document.querySelectorAll('button')).find((el) => /withdraw|เบิก/i.test(el.textContent || ''));" +
      "if (!tab) return false; tab.click(); return true; })()");
    record('reports: withdrawals tab reachable', tabClicked);
    const routeAfterTab = await evaluate("location.pathname");
    record('reports: stayed on /reports after tab click', routeAfterTab === '/reports', routeAfterTab);
    await waitFor("document.querySelectorAll('thead th').length > 0 || /no data|ไม่พบข้อมูล/i.test(document.body.innerText)", 'withdrawals table', 30000);
    await sleep(800);

    const headers = await evaluate("Array.from(document.querySelectorAll('thead th')).map((th) => (th.innerText || '').trim()).filter(Boolean)");
    const hasSource = (headers || []).some((h) => /ที่มา|source/i.test(h));
    const hasReference = (headers || []).some((h) => /เลขอ้างอิง|reference/i.test(h));
    record('reports: "ที่มา" column rendered', hasSource, (headers || []).join(' | ').slice(0, 160));
    record('reports: "เลขอ้างอิง" column rendered', hasReference);

    // Bring the table (with the new SOURCE / REFERENCE columns) into frame.
    await evaluate("(() => { const head = document.querySelector('thead'); if (head) head.scrollIntoView({ block: 'start' }); return true; })()");
    await sleep(600);
    await shot('01-reports-withdrawals-1440.png');
    await setViewport(375, 900);
    await sleep(600);
    await shot('02-reports-withdrawals-375.png');
    await evaluate("document.documentElement.classList.add('dark'); true");
    await sleep(400);
    await shot('03-reports-withdrawals-375-dark.png');
    await evaluate("document.documentElement.classList.remove('dark'); true");
    await setViewport(1440, 900);
    await sleep(400);

    const exportClicked = await evaluate("(() => {" +
      "const btn = Array.from(document.querySelectorAll('button')).find((el) => /excel/i.test(el.textContent || ''));" +
      "if (!btn) return false; btn.click(); return true; })()");
    record('reports: Excel export button clicked', exportClicked);
    let xlsxFile = '';
    if (exportClicked) {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline && !xlsxFile) {
        const files = (await fsp.readdir(OUT_DIR)).filter((f) => f.toLowerCase().endsWith('.xlsx'));
        if (files.length) xlsxFile = path.join(OUT_DIR, files[0]);
        else await sleep(500);
      }
      record('reports: Excel file downloaded', Boolean(xlsxFile), xlsxFile ? path.basename(xlsxFile) : 'no .xlsx produced');
      if (xlsxFile) {
        // Chrome can still hold the handle right after the download finishes — retry.
        let workbook = null;
        let lastError = '';
        for (let attempt = 0; attempt < 12 && !workbook; attempt += 1) {
          try {
            const buffer = await fsp.readFile(xlsxFile);
            workbook = XLSX.read(buffer, { type: 'buffer' });
          } catch (err) {
            lastError = err.message;
            await sleep(500);
          }
        }
        record('excel: workbook parsed', Boolean(workbook), workbook ? '' : lastError);
        if (workbook) {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const cols = (rows[0] || []).map((c) => String(c));
          record('excel: contains "ที่มา" column', cols.some((c) => /ที่มา|source/i.test(c)), cols.join(' | '));
          record('excel: contains "เลขอ้างอิง" column', cols.some((c) => /เลขอ้างอิง|reference/i.test(c)));
        }
      }
    }

    // ----------------------------------------------------------- checkouts
    await goto('/checkouts');
    await waitFor("document.body.innerText.length > 200", 'checkouts page');
    // The list still showed "Loading…" after a fixed sleep, so wait for real content.
    await waitFor("Array.from(document.querySelectorAll('button')).some((b) => /รับคืนอุปกรณ์|Return Equipment/i.test(b.textContent || '')) || /No active loans|ไม่พบรายการ/i.test(document.body.innerText)", 'active loans loaded', 40000);
    await sleep(1000);
    const returnButtonCount = await evaluate("Array.from(document.querySelectorAll('button')).filter((b) => /รับคืนอุปกรณ์|Return Equipment/i.test(b.textContent || '')).length");
    record('checkouts: active loans listed', returnButtonCount > 0, returnButtonCount + ' return button(s)');
    await shot('04-checkouts-active-1440.png');

    const openedModal = await evaluate("(() => {" +
      "const btn = Array.from(document.querySelectorAll('button')).find((el) => /รับคืนอุปกรณ์|Return Equipment/i.test(el.textContent || ''));" +
      "if (!btn) return false; btn.click(); return true; })()");
    record('checkouts: return modal opened', openedModal);
    if (openedModal) {
      await waitFor("!!document.querySelector('[role=dialog]')", 'return modal');
      await sleep(600);
      const inputsBefore = await evaluate("document.querySelectorAll('[role=dialog] input').length");
      const consumedSelected = await evaluate("(() => {" +
        "const sel = Array.from(document.querySelectorAll('[role=dialog] select')).find((s) => Array.from(s.options).some((o) => o.value === 'consumed'));" +
        "if (!sel) return false;" +
        "const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;" +
        "set.call(sel, 'consumed'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
      record('return modal: "consumed" option exists', consumedSelected);
      await sleep(700);
      const afterState = await evaluate("(() => {" +
        "const dlg = document.querySelector('[role=dialog]');" +
        "return { inputs: dlg.querySelectorAll('input').length," +
        " consumedSelects: Array.from(dlg.querySelectorAll('select')).filter((s) => s.value === 'consumed').length," +
        " text: dlg.innerText.slice(0, 400) }; })()");
      record('return modal: extra S/N + reason fields appear', afterState && afterState.inputs > inputsBefore,
        'inputs ' + inputsBefore + ' -> ' + (afterState && afterState.inputs));
      record('return modal: state kept as consumed', afterState && afterState.consumedSelects > 0);
      record('return modal: "not returned to stock" note rendered', Boolean(afterState && /ไม่คืน|not returned/i.test(afterState.text)));

      await shot('05-return-modal-consumed-1440.png');
      await setViewport(375, 900);
      await sleep(500);
      await shot('06-return-modal-consumed-375.png');

      // Submit with an EMPTY reason: validation must block it, so no RPC may leave the browser.
      const submitted = await evaluate("(() => {" +
        "const dlg = document.querySelector('[role=dialog]');" +
        "const btn = dlg.querySelector('button[type=submit]');" +
        "if (!btn) return false; btn.click(); return true; })()");
      await sleep(1500);
      record('submit blocked without reason (no process_return_order RPC)', rpcCalls.length === 0, rpcCalls.join(' ; ') || 'no RPC sent');
      const toastText = await evaluate("(() => { const t = document.body.innerText; const i = t.search(/กรุณาระบุเหตุผล|provide the reason/i); return i >= 0 ? t.slice(i, i + 90) : ''; })()");
      record('validation toast shown', Boolean(toastText), toastText || 'toast text not found');
      await shot('07-return-modal-validation-375.png');

      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(600);
      await setViewport(1440, 900);
    }
  } finally {
    if (cdp) cdp.close();
    try { browser.kill(); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.pass);
  const summary = {
    baseUrl: BASE_URL,
    readOnly: true,
    rpcCalls,
    shots,
    consoleErrors: consoleErrors.slice(0, 20),
    results,
    passed: results.length - failed.length,
    failed: failed.length,
  };
  await fsp.writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, shots: shots.length, consoleErrors: summary.consoleErrors.length, rpcCalls: rpcCalls.length }, null, 2));
  if (summary.consoleErrors.length) console.log('console errors:\n' + summary.consoleErrors.join('\n'));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-consumed-ui failed: ' + err.message);
  process.exit(1);
});
