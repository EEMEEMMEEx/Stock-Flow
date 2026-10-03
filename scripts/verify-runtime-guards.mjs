// Behavioural verification for the global error guard in index.html.
// Plain Node script (no browser, no child processes) so it runs under the DSH sandbox:
//   npm run verify:runtime-guards
//
// It extracts the FIRST inline <script> block from index.html, executes it in a Node vm
// sandbox with stubbed browser globals, then dispatches synthetic error /
// unhandledrejection events to the registered listeners. This proves WHICH errors the
// guard suppresses: DevTools / injected-script noise and ordinary app errors must stay
// visible; only the third-party extension content-script pattern may be suppressed.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let failures = 0;
const rows = [];

const check = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : 'got=' + actual + ' expected=' + expected });
};

// --- extract + execute the inline guard -------------------------------------
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('[FAIL] No inline <script> block found in index.html - update this verifier.');

const listeners = new Map();
const context = createContext({
  localStorage: { getItem: () => null },
  document: { documentElement: { classList: { add: () => {} } } },
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, handler) => { listeners.set(type, handler); },
  },
  console,
});
runInContext(match[1], context);

const fireError = (message, stack) => {
  const handler = listeners.get('error');
  if (!handler) throw new Error('[FAIL] index.html did not register a window "error" listener.');
  const event = {
    message,
    error: { stack },
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
  };
  handler(event);
  return event.defaultPrevented && event.propagationStopped;
};

const fireRejection = (message, stack) => {
  const handler = listeners.get('unhandledrejection');
  if (!handler) throw new Error('[FAIL] index.html did not register a window "unhandledrejection" listener.');
  const event = {
    reason: { message, stack },
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
  };
  handler(event);
  return event.defaultPrevented && event.propagationStopped;
};

// --- behavioural cases ------------------------------------------------------
const DEVTOOLS_STARTTIME = "Cannot read properties of undefined (reading 'startTime')";
const DEVTOOLS_STACK = "TypeError: Cannot read properties of undefined (reading 'startTime') at et.reportAllChanges (VM44:2:1)";
const EXTENSION_ONMESSAGE = "Cannot read properties of undefined (reading 'onMessage')";
const EXTENSION_STACK = "TypeError: Cannot read properties of undefined (reading 'onMessage') at content.js:1:1";

check('DevTools Live Metrics startTime error stays visible (window error)',
  fireError(DEVTOOLS_STARTTIME, DEVTOOLS_STACK), false);

check('DevTools Soft Navigation error stays visible (window error)',
  fireError('Uncaught TypeError: x', 'TypeError: x at DevToolsReportSoftNavs (VM51:3:1)'), false);

check('third-party extension content script error is suppressed (window error)',
  fireError(EXTENSION_ONMESSAGE, EXTENSION_STACK), true);

check('ordinary app error stays visible (window error)',
  fireError("Cannot read properties of undefined (reading 'items')", 'TypeError: x at Withdrawals.jsx:120'), false);

check('DevTools startTime rejection stays visible (unhandledrejection)',
  fireRejection(DEVTOOLS_STARTTIME, DEVTOOLS_STACK), false);

check('third-party extension rejection is suppressed (unhandledrejection)',
  fireRejection(EXTENSION_ONMESSAGE, EXTENSION_STACK), true);

// --- source audit: the removed patterns must not creep back -----------------
const lowerHtml = html.toLowerCase();

check('index.html has no reportallchanges needle',
  lowerHtml.includes('reportallchanges'), false);

check('index.html has no devtoolsreportsoftnavs needle',
  lowerHtml.includes('devtoolsreportsoftnavs'), false);

check("index.html has no (reading 'starttime') needle",
  lowerHtml.includes("(reading 'starttime')"), false);

check("index.html still keeps the (reading 'onmessage') needle",
  lowerHtml.includes("(reading 'onmessage')"), true);

// --- report -----------------------------------------------------------------
console.log('====================================================');
console.log('   Runtime error guard verification (index.html)      ');
console.log('====================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('----------------------------------------------------');
console.log('Total: ' + rows.length + ' cases, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Runtime error guard verification failed.');
  process.exit(1);
}
console.log('[PASS] All runtime error guard cases passed.');
