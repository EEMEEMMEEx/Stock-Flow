import { supabase } from './supabase.js';

const LOCAL_STORAGE_KEY = 'stockflow_gemini_api_key';

/**
 * Retrieve Gemini API key from environment variable or localStorage
 */
export function getGeminiApiKey() {
  const envKey = typeof import.meta !== 'undefined' && import.meta.env 
    ? import.meta.env.VITE_GEMINI_API_KEY 
    : globalThis.process?.env?.VITE_GEMINI_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? stored.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Retrieve Gemini API key status and source details
 */
export function getGeminiApiKeyDetails() {
  const envKey = typeof import.meta !== 'undefined' && import.meta.env 
    ? import.meta.env.VITE_GEMINI_API_KEY 
    : globalThis.process?.env?.VITE_GEMINI_API_KEY;
  const hasEnvKey = Boolean(envKey && typeof envKey === 'string' && envKey.trim().length > 0);
  let localKey = '';
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    localKey = stored ? stored.trim() : '';
  } catch {
    localKey = '';
  }

  const activeKey = hasEnvKey ? envKey.trim() : localKey;

  return {
    hasKey: Boolean(activeKey),
    source: hasEnvKey ? 'env' : (localKey ? 'local' : 'none'),
    activeKey,
    localKey,
    hasEnvKey
  };
}

/**
 * Store user-provided Gemini API key locally
 */
export function saveGeminiApiKey(key) {
  try {
    if (!key || !key.trim()) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, key.trim());
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stockflow:gemini-key-updated', {
        detail: { hasKey: Boolean(key && key.trim()) }
      }));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Gather live summary of inventory for Gemini context grounding
 */
export async function fetchLiveInventoryContext() {
  try {
    const [
      { data: projects },
      { data: items },
      { data: balances },
      { data: recentWithdrawals }
    ] = await Promise.all([
      supabase.from('projects').select('id, name, project_code, location').eq('status', 'active'),
      supabase.from('items').select('id, name, sku, model, unit, category_id').limit(200),
      supabase.from('stock_balance').select('project_id, item_id, balance'),
      supabase.from('withdrawal_orders')
        .select('id, work_order_no, project_id, status, requested_at, profiles:requested_by(full_name), projects(name)')
        .order('requested_at', { ascending: false })
        .limit(8)
    ]);

    const projectMap = new Map((projects || []).map(p => [p.id, p]));
    const itemMap = new Map((items || []).map(i => [i.id, i]));

    // Join balance with item and warehouse names
    const enrichedBalances = (balances || []).map(b => {
      const itm = itemMap.get(b.item_id);
      const prj = projectMap.get(b.project_id);
      return {
        itemId: b.item_id,
        projectId: b.project_id,
        name: itm?.name || 'Unknown Item',
        sku: itm?.sku || '',
        unit: itm?.unit || 'ชิ้น',
        warehouseName: prj?.location ? `${prj.name} (${prj.location})` : (prj?.name || 'Unknown Warehouse'),
        balance: Number(b.balance) || 0
      };
    });

    // Low stock items (balance <= 5)
    const lowStockItems = enrichedBalances
      .filter(b => b.balance <= 5)
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 15);

    // Top stock items
    const topStockItems = [...enrichedBalances]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    // Recent activities (safely handle profiles join)
    const recentActivities = (recentWithdrawals || []).map(w => ({
      type: 'Withdrawal',
      orderNumber: w.work_order_no || w.id?.slice(0, 8) || '-',
      projectName: w.projects?.name || '-',
      requester: w.profiles?.full_name || '-',
      status: w.status || '-',
      date: w.requested_at
    }));

    return {
      projects: (projects || []).map(p => ({
        id: p.id,
        name: p.name,
        code: p.project_code,
        location: p.location
      })),
      totalItems: items?.length || 0,
      lowStockItems,
      topStockItems,
      recentActivities
    };
  } catch (err) {
    console.warn('[Gemini Copilot] Failed to fetch full inventory context:', err);
    return null;
  }
}

/**
 * Ask StockFlow Copilot via backend API or direct client REST fallback
 */
export async function askStockFlowCopilot({ query, conversationHistory = [] }) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('กรุณาระบุข้อความคำถาม');
  }

  // 1. Fetch live inventory context
  const clientContext = await fetchLiveInventoryContext();

  // 2. Try serverless backend API first (/api/gemini-copilot) with 8s timeout
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/gemini-copilot', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        conversationHistory,
        clientContext
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.answer) {
        return {
          answer: data.answer,
          source: 'serverless',
          model: data.model || 'gemini-3.5-flash-lite'
        };
      }
    }
  } catch {
    // Backend API unavailable / timeout - smoothly continue to client-side fallback
  }

  // 3. Client-side direct Google AI API call
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      needsKey: true,
      answer: 'ยังไม่ได้กำหนดค่า **GEMINI_API_KEY** ในระบบ\n\nคุณสามารถรับ API Key ได้ฟรี (Free Tier) จาก [Google AI Studio](https://aistudio.google.com/) โดยไปที่หน้า **[ตั้งค่าระบบ (/settings)](/settings)** เพื่อระบุ API Key หรือกำหนดในไฟล์ `.env` เป็น `VITE_GEMINI_API_KEY=AIza...`'
    };
  }

  try {
    let contextSnippet = '';
    if (clientContext) {
      contextSnippet = `
--- LIVE INVENTORY CONTEXT (ข้อมูลจริงล่าสุดจากระบบ) ---
- คลังสินค้า/โครงการที่เปิดใช้งาน: ${(clientContext.projects || []).map(p => `${p.name} (${p.location || '-'})`).join(', ')}
- จำนวนประเภทพัสดุในระบบ: ${clientContext.totalItems} รายการ
- สินค้าที่สต็อกต่ำหรือหมด:
${(clientContext.lowStockItems || []).map(i => `  * ${i.name} (SKU: ${i.sku || '-'}) คงเหลือ: ${i.balance} ${i.unit} ที่คลัง ${i.warehouseName}`).join('\n')}
- สินค้าที่มีสต็อกสูงสุด:
${(clientContext.topStockItems || []).map(i => `  * ${i.name}: คงเหลือ ${i.balance} ${i.unit} ที่คลัง ${i.warehouseName}`).join('\n')}
- ประวัติการทำรายการล่าสุด:
${(clientContext.recentActivities || []).map(a => `  * ใบเบิก #${a.orderNumber} โครงการ: ${a.projectName} ผู้ขอ: ${a.requester} สถานะ: ${a.status}`).join('\n')}
------------------------------------------------------
`;
    }

    const systemInstruction = `
คุณคือ "StockFlow Copilot" ผู้ช่วยปัญญาประดิษฐ์อัจฉริยะประจำระบบจัดการคลังสินค้า StockFlow
ภารกิจ:
1. ตอบคำถามเกี่ยวกับการตรวจสอบสต็อก พัสดุ คลังสินค้า และความเคลื่อนไหวในระบบ
2. ตอบเป็นภาษาไทยที่สุภาพ กระชับ อ่านเข้าใจง่าย ใช้ Markdown (หัวข้อ, รายการ bullet, ตารางสรุป)
3. อ้างอิงข้อมูลจริงจาก LIVE INVENTORY CONTEXT ที่ได้รับ
${contextSnippet}
`;

    // Format conversation history for Gemini REST API
    const contents = [];
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        const text = msg.text || msg.content || '';
        if (text && (msg.role === 'user' || msg.role === 'model' || msg.role === 'assistant')) {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    // High availability models (fast models first to prevent hanging)
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];
    let lastError = null;
    let answer = null;
    let successfulModel = candidateModels[0];

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: 0.2
            }
          }),
          signal: AbortSignal.timeout(7000)
        });

        const data = await response.json();
        if (response.ok) {
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            answer = text;
            successfulModel = model;
            break;
          }
        } else {
          lastError = new Error(data.error?.message || 'API Error');
          console.warn(`[Gemini Client] Model ${model} returned error:`, data.error?.message);
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Client] Model ${model} failed, trying next:`, err.message);
      }
    }

    if (!answer) {
      if (lastError?.message && lastError.message.includes('API key not valid')) {
        return {
          needsKey: true,
          answer: '⚠️ **API Key ไม่ถูกต้อง** กรุณาตรวจสอบหรืออัปเดต API Key ในเมนู **[ตั้งค่าระบบ (/settings)](/settings)** หรือขอรับ Key ใหม่จาก [Google AI Studio](https://aistudio.google.com/)'
        };
      }
      throw lastError || new Error('ไม่สามารถรับคำตอบจาก Gemini ได้ กรุณาลองใหม่อีกครั้ง');
    }

    return {
      answer,
      source: 'client-direct',
      model: successfulModel
    };
  } catch (clientErr) {
    console.error('[Gemini Client Error]', clientErr);
    throw new Error(clientErr.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Gemini API');
  }
}
