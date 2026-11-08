import { createClient } from '@supabase/supabase-js';

const CAIM_API_DEFAULT_URL = 'https://claims-nu-taupe.vercel.app/api/tickets';
const CAIM_BASE_DEFAULT_URL = 'https://claims-nu-taupe.vercel.app';

export default async function handler(req, res) {
  // CORS & Security Headers
  const requestOrigin = req.headers.origin;
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
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
        // Verify RBAC permission for the caller
        const [permScrap, permRepair, permReturn, isSuper] = await Promise.all([
          supabaseAdmin.rpc('has_permission', { p_user_id: authUser.id, p_permission_code: 'scrap.view' }).then(r => Boolean(r.data)).catch(() => false),
          supabaseAdmin.rpc('has_permission', { p_user_id: authUser.id, p_permission_code: 'checkouts.resolve_repair' }).then(r => Boolean(r.data)).catch(() => false),
          supabaseAdmin.rpc('has_permission', { p_user_id: authUser.id, p_permission_code: 'checkouts.return' }).then(r => Boolean(r.data)).catch(() => false),
          supabaseAdmin.rpc('is_super_admin', { p_user_id: authUser.id }).then(r => Boolean(r.data)).catch(() => false)
        ]);

        if (permScrap || permRepair || permReturn || isSuper) {
          isAuthorized = true;
        } else {
          // Check role name fallback
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role_id, roles(code)')
            .eq('id', authUser.id)
            .single();

          const roleCode = profile?.roles?.code;
          if (roleCode === 'ADMIN' || roleCode === 'SUPER') {
            isAuthorized = true;
          }
        }
      }
    } catch (authEx) {
      console.warn('[sync-to-caim] Token verification error:', authEx.message);
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Requires scrap.view, checkouts.resolve_repair, or Admin privilege to submit claims to CAIM.'
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

  // 3. Pre-flight Concurrency & State Check
  const { data: returnLog, error: fetchErr } = await supabaseAdmin
    .from('checkout_return_logs')
    .select('id, caim_ticket_id, caim_sync_status, repair_resolution_status, caim_inbound_status, is_reverted')
    .eq('id', return_log_id)
    .single();

  if (fetchErr || !returnLog) {
    return res.status(404).json({ success: false, message: 'Return log not found' });
  }

  if (returnLog.is_reverted) {
    return res.status(400).json({ success: false, message: 'รายการนี้ถูกย้อนคืน (Reverted) ไปแล้ว ไม่สามารถส่งเคลมได้' });
  }

  if (returnLog.caim_ticket_id || returnLog.caim_sync_status === 'synced') {
    return res.status(409).json({
      success: false,
      message: `รายการนี้ได้ส่งเคลมไปยัง CAIM แล้ว (Ticket: ${returnLog.caim_ticket_id || '-'})`
    });
  }

  if (returnLog.repair_resolution_status !== 'unresolved') {
    return res.status(400).json({
      success: false,
      message: `รายการนี้ได้รับการจัดการผลซ่อมภายในไปแล้ว (${returnLog.repair_resolution_status}) ไม่สามารถส่งเคลมได้`
    });
  }

  if (returnLog.caim_inbound_status === 'pending_confirmation') {
    return res.status(400).json({
      success: false,
      message: 'รายการนี้อยู่ระหว่างรอการยืนยันผลเคลมจาก CAIM'
    });
  }

  // Atomic pre-flight lock: mark sync status as pending
  const { error: lockErr } = await supabaseAdmin
    .from('checkout_return_logs')
    .update({ caim_sync_status: 'pending' })
    .eq('id', return_log_id)
    .is('caim_ticket_id', null);

  if (lockErr) {
    return res.status(409).json({ success: false, message: 'รายการนี้อยู่ระหว่างดำเนินการส่งเคลม' });
  }

  const trimmedSerial = String(serial_number).trim();
  const trimmedProblem = String(problem_desc || '').trim() || 'อุปกรณ์ชำรุดจากการใช้งานหน้างาน';
  const caimApiUrl = process.env.CAIM_API_URL || CAIM_API_DEFAULT_URL;
  const caimBaseUrl = process.env.CAIM_BASE_URL || CAIM_BASE_DEFAULT_URL;

  // 4. Prepare CAIM Ticket Payload
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
    // 5. Send Request to CAIM with 10-second timeout
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

    // 6. Success: Extract ticket ID and build link
    const ticketId = caimData.ticket?.id || caimData.id || `CLM-${Date.now().toString().slice(-4)}`;
    const ticketUrl = `${caimBaseUrl}/tickets?search=${encodeURIComponent(ticketId)}`;

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
