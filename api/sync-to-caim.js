import { createClient } from '@supabase/supabase-js';

const CAIM_API_DEFAULT_URL = 'https://claims-nu-taupe.vercel.app/api/tickets';
const CAIM_BASE_DEFAULT_URL = 'https://claims-nu-taupe.vercel.app';

export default async function handler(req, res) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Internal-Secret'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: Missing Supabase URL or Service Role Key'
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Authenticate Caller
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const internalSecret = req.headers['x-internal-secret'];

  let callerUser = null;
  let isAuthorized = false;

  if (internalSecret && process.env.INTERNAL_SERVICE_KEY && internalSecret === process.env.INTERNAL_SERVICE_KEY) {
    isAuthorized = true;
  } else if (token) {
    try {
      const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (!authErr && authUser) {
        callerUser = authUser;
        isAuthorized = true;
      }
    } catch (authEx) {
      console.warn('[sync-to-caim] Token verification error:', authEx.message);
    }
  }

  if (!isAuthorized) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Valid authentication token required to sync with CAIM.'
    });
  }

  // 2. Validate Payload
  const {
    return_log_id,
    order_number,
    borrower_name,
    project_name,
    serial_number,
    item_name,
    vendor,
    model,
    problem_desc,
    reporter_name
  } = req.body || {};

  if (!return_log_id) {
    return res.status(400).json({ success: false, message: 'return_log_id is required' });
  }

  if (!serial_number || !String(serial_number).trim()) {
    return res.status(400).json({ success: false, message: 'serial_number is required to open a claim ticket' });
  }

  const trimmedSerial = String(serial_number).trim();
  const trimmedProblem = String(problem_desc || '').trim() || 'อุปกรณ์ชำรุดจากการใช้งานหน้างาน นำอุปกรณ์ใหม่ไปทดแทนแล้ว';
  const caimApiUrl = process.env.CAIM_API_URL || CAIM_API_DEFAULT_URL;
  const caimBaseUrl = process.env.CAIM_BASE_URL || CAIM_BASE_DEFAULT_URL;

  // 3. Prepare CAIM Ticket Payload
  const caimPayload = {
    title: `แจ้งเคลมอุปกรณ์จากการยืมทดแทน (${order_number || 'Stock-Flow'})`,
    serialNo: trimmedSerial,
    problemDesc: trimmedProblem,
    station: project_name || 'คลังสินค้ากลาง',
    vendor: vendor || 'Other',
    model: model || item_name || '-',
    reporterName: reporter_name || callerUser?.user_metadata?.full_name || borrower_name || 'เจ้าหน้าที่คลัง',
    remarks: `อ้างอิงคำสั่งยืม Stock-Flow: ${order_number || '-'} (Return Log: ${return_log_id})`
  };

  try {
    // 4. Send Request to CAIM with 10-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const caimResponse = await fetch(caimApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CAIM_API_KEY ? { Authorization: `Bearer ${process.env.CAIM_API_KEY}` } : {})
      },
      body: JSON.stringify(caimPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const caimData = await caimResponse.json().catch(() => ({}));

    if (!caimResponse.ok || !caimData.success) {
      const errorMsg = caimData.error || caimData.message || `CAIM responded with status ${caimResponse.status}`;
      
      // Update return log to 'failed'
      await supabaseAdmin.rpc('update_checkout_return_caim_sync', {
        p_payload: {
          return_log_id,
          caim_sync_status: 'failed',
          caim_sync_error: errorMsg
        }
      }).catch(err => console.warn('[sync-to-caim] DB status update error:', err.message));

      return res.status(502).json({
        success: false,
        message: `Failed to create ticket in CAIM: ${errorMsg}`,
        error: errorMsg
      });
    }

    // 5. Success: Extract ticket ID and build link
    const ticketId = caimData.ticket?.id || caimData.id || `CLM-${Date.now().toString().slice(-4)}`;
    const ticketUrl = `${caimBaseUrl}/tickets?search=${encodeURIComponent(ticketId)}`;

    // Update return log to 'synced'
    const { error: dbError } = await supabaseAdmin.rpc('update_checkout_return_caim_sync', {
      p_payload: {
        return_log_id,
        caim_ticket_id: ticketId,
        caim_ticket_url: ticketUrl,
        caim_sync_status: 'synced',
        caim_sync_error: null
      }
    });

    if (dbError) {
      console.warn('[sync-to-caim] DB update warning:', dbError.message);
    }

    return res.status(200).json({
      success: true,
      ticket_id: ticketId,
      ticket_url: ticketUrl,
      message: `สร้างใบแจ้งเคลมในระบบ CAIM เรียบร้อยแล้ว (${ticketId})`
    });

  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout
      ? 'การเชื่อมต่อไปยัง CAIM หมดเวลา (Timeout 10s)'
      : (err.message || 'Network error connecting to CAIM');

    console.error('[sync-to-caim] Error:', err);

    // Record failure in DB non-blockingly
    await supabaseAdmin.rpc('update_checkout_return_caim_sync', {
      p_payload: {
        return_log_id,
        caim_sync_status: 'failed',
        caim_sync_error: errorMsg
      }
    }).catch(() => {});

    return res.status(504).json({
      success: false,
      message: errorMsg,
      error: err.message
    });
  }
}
