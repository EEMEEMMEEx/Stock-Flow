// Behavioural verification for the Global Email Branding contract (v1.13.6).
// Plain Node script (no JSX, no child processes) so it runs under the DSH sandbox:
//   npm run verify:email-branding
import { readFileSync } from "node:fs";

import {
  SAMPLE_EMAIL_DATA_BY_EVENT,
  getSampleEmailData,
  renderEmailHtml,
  renderUserInvitationEmailHtml,
} from "../src/lib/emailRenderer.js";
import {
  DEFAULT_LOGO_URL,
  DEFAULT_PUBLIC_BASE_URL,
  buildActionUrl,
  normalizeBaseUrl,
} from "../src/lib/emailSettings.js";

// Deliberately hostile admin input: scheme-less logo, trailing slash, custom accent.
const TRAILING_SLASH_BASE = "https://stockflowth.online/";
const SCHEME_LESS_LOGO = "stockflowth.online/images/logo.png";
const ACCENT = "#3b82f6";

const BRANDING = {
  app_name: "StockFlow",
  logo_url: SCHEME_LESS_LOGO,
  public_base_url: TRAILING_SLASH_BASE,
  accent_color: ACCENT,
};

let failures = 0;
const rows = [];

const check = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? "PASS" : "FAIL", label, detail: pass ? "" : detail });
};

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

// --- 1. Normaliser contract --------------------------------------------------
check("normalizeBaseUrl : trailing slash removed", normalizeBaseUrl(TRAILING_SLASH_BASE) === DEFAULT_PUBLIC_BASE_URL, normalizeBaseUrl(TRAILING_SLASH_BASE));
check("normalizeBaseUrl : missing scheme repaired", normalizeBaseUrl("stockflowth.online") === DEFAULT_PUBLIC_BASE_URL, normalizeBaseUrl("stockflowth.online"));
check("normalizeBaseUrl : retained path", normalizeBaseUrl("https://x.example/app/") === "https://x.example/app", normalizeBaseUrl("https://x.example/app/"));
check("normalizeBaseUrl : garbage falls back", normalizeBaseUrl("not a url") === DEFAULT_PUBLIC_BASE_URL, normalizeBaseUrl("not a url"));
check("normalizeBaseUrl : foreign scheme rejected", normalizeBaseUrl("ftp://x.example") === DEFAULT_PUBLIC_BASE_URL, normalizeBaseUrl("ftp://x.example"));
check("buildActionUrl : exactly one slash", buildActionUrl(TRAILING_SLASH_BASE, "/withdrawals") === DEFAULT_PUBLIC_BASE_URL + "/withdrawals", buildActionUrl(TRAILING_SLASH_BASE, "/withdrawals"));
check("buildActionUrl : keeps the route (Bug #1)", buildActionUrl(TRAILING_SLASH_BASE, "/withdrawals") !== DEFAULT_PUBLIC_BASE_URL);
check("buildActionUrl : scheme-less base", buildActionUrl("stockflowth.online", "stock-in") === DEFAULT_PUBLIC_BASE_URL + "/stock-in", buildActionUrl("stockflowth.online", "stock-in"));
check("buildActionUrl : query-only path", buildActionUrl(TRAILING_SLASH_BASE, "?order_id=CHK-1") === DEFAULT_PUBLIC_BASE_URL + "?order_id=CHK-1", buildActionUrl(TRAILING_SLASH_BASE, "?order_id=CHK-1"));

// --- 2. Every rendered event template carries the branding -------------------
const routeFor = (event) => (
  event.startsWith("checkout_")
    ? "/checkouts?order_id="
    : (event === "stock_in_created" ? "/stock-in" : (event === "low_stock_alert" ? "/items" : "/withdrawals"))
);

const events = Object.keys(SAMPLE_EMAIL_DATA_BY_EVENT);
check("template inventory : 13 notification events", events.length === 13, "found " + events.length);

for (const event of events) {
  const html = renderEmailHtml({
    branding: BRANDING,
    template: { event_type: event },
    data: getSampleEmailData(event),
  });

  check(`${event} : logo rendered from the self-hosted asset`, html.includes(`src="${DEFAULT_LOGO_URL}"`), "logo <img> missing");
  check(`${event} : accent color inlined`, html.includes(ACCENT), "accent color missing");
  check(`${event} : no unresolved variable`, !html.includes("{{"), "unresolved placeholder found");
  check(`${event} : CTA keeps its route`, html.includes(DEFAULT_PUBLIC_BASE_URL + routeFor(event)), "expected " + DEFAULT_PUBLIC_BASE_URL + routeFor(event));

  const linkValues = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  const badLinks = linkValues.filter((value) => value.startsWith("https://") && value.slice(8).includes("//"));
  check(`${event} : no double slash in links`, badLinks.length === 0, badLinks.join(", "));
}

// --- 3. User invitation template (Bug #6) -----------------------------------
const invitationHtml = renderUserInvitationEmailHtml({
  appName: "StockFlow",
  userName: "QA User",
  userEmail: "qa@stockflowth.online",
  roleName: "STAFF",
  projectAccessSummary: "1 project",
  actionUrl: buildActionUrl(TRAILING_SLASH_BASE, "/"),
  branding: BRANDING,
});
check("user invitation : logo rendered (Bug #6)", invitationHtml.includes(`src="${DEFAULT_LOGO_URL}"`), "logo <img> missing");
check("user invitation : accent color inlined", invitationHtml.includes(ACCENT), "accent color missing");
check("user invitation : CTA normalised", invitationHtml.includes(`href="${DEFAULT_PUBLIC_BASE_URL}/"`), "action link not normalised");

// --- 4. A cleared logo falls back to the self-hosted asset -------------------
const clearedLogoHtml = renderEmailHtml({
  branding: { ...BRANDING, logo_url: "" },
  template: { event_type: "withdrawal_submitted" },
  data: getSampleEmailData("withdrawal_submitted"),
});
check("empty logo_url : self-hosted fallback", clearedLogoHtml.includes(`src="${DEFAULT_LOGO_URL}"`), "fallback logo missing");

// --- 5. Source audit : the fixed call sites stay fixed -----------------------
const dispatcher = source("../src/lib/notificationDispatcher.js");
const dispatcherLines = dispatcher.split(String.fromCharCode(10));
const brandingCtaLines = dispatcherLines.filter((line) => line.includes("action_url: buildActionUrl(branding.public_base_url,"));
check("dispatcher : three branding-driven CTA links", brandingCtaLines.length === 3, "found " + brandingCtaLines.length);
for (const route of ["/withdrawals", "/stock-in", "/items"]) {
  check("dispatcher : CTA route " + route + " kept", brandingCtaLines.some((line) => line.includes(route)), "route missing");
}
check("dispatcher : no bare public_base_url fallback", !dispatcher.includes("public_base_url ||"));
check("dispatcher : checkout CTA built from the normalised base", dispatcherLines.some((line) => line.includes("action_url: buildActionUrl(publicBaseUrl,")));

const api = source("../api/send-email.js");
check("api/send-email : reads system_settings branding", api.includes("brandingData") && api.includes("system_settings"));
check("api/send-email : branding feeds the From name", api.includes("|| brandingAppName"));
const senderNameIndex = api.indexOf("const senderName = String(");
const senderNameReplaceIndex = api.indexOf(".replace(", senderNameIndex);
check("api/send-email : display name sanitised", senderNameIndex > -1 && senderNameReplaceIndex > senderNameIndex && senderNameReplaceIndex < senderNameIndex + 900 && api.indexOf("trim()", senderNameReplaceIndex) > senderNameReplaceIndex);

const manager = source("../src/components/settings/EmailTemplateManager.jsx");
check("EmailTemplateManager : test email carries branding", manager.includes("event_type: selectedEventKey, branding }"));
check("EmailTemplateManager : base URL normalised on save", manager.includes("public_base_url: baseUrlInput ? normalizeBaseUrl(baseUrlInput) : "));
check("EmailTemplateManager : logo URL validated on save", manager.includes("isLikelyImageUrl(logoInput)"));

const users = source("../src/pages/UserManagement.jsx");
const invitationSites = users.split("branding: await fetchEmailBranding()").length - 1;
check("UserManagement : both invitation sites carry branding", invitationSites === 2, "found " + invitationSites);

const service = source("../src/lib/emailService.js");
const invitationBlock = service.slice(service.indexOf("export async function sendUserInvitationEmail"), service.indexOf("export async function sendUserInvitationEmail") + 1800);
check("emailService : invitation forwards branding", invitationBlock.includes("branding,"));

// --- report -----------------------------------------------------------------
console.log("====================================================");
console.log("   Global Email Branding verification                 ");
console.log("====================================================");
for (const row of rows) {
  console.log(`[${row.status}] ${row.label}${row.detail ? " - " + row.detail : ""}`);
}
console.log("----------------------------------------------------");
console.log(`Total: ${rows.length} cases, failed: ${failures}`);

if (failures > 0) {
  console.error("[FAIL] Global Email Branding verification failed.");
  process.exit(1);
}
