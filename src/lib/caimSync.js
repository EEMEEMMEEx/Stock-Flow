import { supabase } from './supabase';

const viteEnv = import.meta.env || {};

/**
 * Dispatch an equipment return record (consumed replacement item) to CAIM (Process Claim)
 * to automatically create a claim/RMA ticket.
 *
 * @param {Object} params
 * @param {string} params.returnLogId - UUID of the checkout_return_logs record
 * @param {string} [params.orderNumber] - Checkout order number e.g. "CO-2026-0042"
 * @param {string} [params.borrowerName] - Name of borrower
 * @param {string} [params.projectName] - Location/Station/Project name
 * @param {string} params.serialNumber - Serial number of the defective equipment replaced
 * @param {string} [params.itemName] - Name of the equipment item
 * @param {string} [params.vendor] - Manufacturer/Vendor
 * @param {string} [params.model] - Equipment model
 * @param {string} [params.problemDesc] - Reason/defect description
 * @param {string} [params.reporterName] - Name of reporting officer
 * @returns {Promise<{ success: boolean, ticket_id: string, ticket_url: string }>}
 */
export async function syncReturnLogToCaim({
  returnLogId,
  orderNumber,
  borrowerName,
  projectName,
  serialNumber,
  itemName,
  vendor,
  model,
  problemDesc,
  reporterName,
}) {
  if (!returnLogId || !serialNumber) {
    throw new Error('Missing returnLogId or serialNumber for CAIM sync');
  }

  const isBrowser = typeof window !== 'undefined';
  const isGithubPages = isBrowser && (
    window.location.hostname === 'github.io' ||
    window.location.hostname.endsWith('.github.io')
  );
  const dynamicOrigin = isBrowser && !isGithubPages && window.location.origin
    ? window.location.origin
    : 'https://stockflowth.online';
  const endpoint = viteEnv.VITE_CAIM_SYNC_URL || `${dynamicOrigin}/api/sync-to-caim`;

  const authHeaders = {};
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (authErr) {
    console.warn('[caimSync] Could not retrieve session token:', authErr);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      return_log_id: returnLogId,
      order_number: orderNumber,
      borrower_name: borrowerName,
      project_name: projectName,
      serial_number: serialNumber,
      item_name: itemName,
      vendor,
      model,
      problem_desc: problemDesc,
      reporter_name: reporterName,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.message || `CAIM Sync failed (HTTP ${response.status})`);
  }

  return result;
}
