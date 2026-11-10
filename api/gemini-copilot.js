import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS & Security Headers
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(400).json({
        success: false,
        needsKey: true,
        message: 'GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in environment variables.'
      });
    }

    // Authenticate user via Supabase JWT
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const supabaseKey = serviceRoleKey || supabaseAnonKey;

    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    let currentUser = null;
    if (token && supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (!authErr && user) {
          currentUser = user;
        }
      } catch (authEx) {
        console.warn('[Gemini Copilot API] Auth token check error:', authEx.message);
      }
    }

    const parsedBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { query, conversationHistory = [], clientContext = null } = parsedBody;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, message: 'Query string is required.' });
    }

    // Build system instruction and knowledge context
    let inventorySummaryText = '';
    if (clientContext && typeof clientContext === 'object') {
      inventorySummaryText = `
--- LIVE INVENTORY CONTEXT (from current database state) ---
- Active Warehouses/Projects: ${(clientContext.projects || []).map(p => `${p.name} (Code: ${p.code || '-'}, Loc: ${p.location || '-'})`).join(', ')}
- Total Item Types: ${clientContext.totalItems || 0}
- Items with Low or Zero Stock:
${(clientContext.lowStockItems || []).slice(0, 15).map(item => `  * ${item.name} (${item.sku || 'No SKU'}): คงเหลือ ${item.balance} ${item.unit || 'ชิ้น'} ที่คลัง ${item.warehouseName}`).join('\n')}
- Top Stock Items:
${(clientContext.topStockItems || []).slice(0, 10).map(item => `  * ${item.name}: คงเหลือ ${item.balance} ${item.unit || 'ชิ้น'}`).join('\n')}
- Recent Stock Movements:
${(clientContext.recentActivities || []).slice(0, 8).map(act => `  * [${act.type || 'Order'}] #${act.orderNumber || '-'} คลัง: ${act.projectName || '-'} ผู้ขอ: ${act.requester || '-'} สถานะ: ${act.status || '-'}`).join('\n')}
-----------------------------------------------------------
`;
    }

    const systemInstruction = `
คุณคือ "StockFlow Copilot" ผู้ช่วยปัญญาประดิษฐ์อัจฉริยะประจำระบบจัดการคลังสินค้า StockFlow (ขับเคลื่อนด้วย Google Gemini 3.8 Flash)
ภารกิจของคุณ:
1. ช่วยเหลือเจ้าหน้าที่คลังสินค้าและผู้บริหารในการตรวจสอบสถานะสต็อก, ค้นหาพัสดุ, แจ้งเตือนสินค้าขาดแคลน, และแนะนำการสั่งซื้อ/กระจายสต็อกข้ามคลัง
2. ตอบคำถามเป็นภาษาไทยที่สุภาพ กระชับ ชัดเจน และเป็นมืออาชีพ (คำศัพท์เฉพาะทาง, รหัส SKU, รหัสโครงการ สามารถใช้ภาษาอังกฤษได้)
3. หากมีข้อมูลใน LIVE INVENTORY CONTEXT ให้นำข้อมูลจริงมาตอบและสรุปอย่างเป็นระบบ ใช้ Markdown (หัวข้อ, รายการ bullet, ตารางสรุป) ให้อ่านง่าย
4. หากผู้ใช้ถามเรื่องที่ข้อมูลในคลังไม่มี ให้แจ้งตามตรงอย่างสุภาพ และแนะนำสิ่งที่ควรทำต่อ
${inventorySummaryText}
`;

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Format conversation history for Gemini contents
    const contents = [];
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'model' || msg.role === 'assistant') {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.text || msg.content || '' }]
          });
        }
      }
    }
    // Append the current user query
    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
      }
    });

    const answer = response.text || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้ในขณะนี้';

    return res.status(200).json({
      success: true,
      answer,
      model: 'gemini-3.8-flash',
      user: currentUser ? currentUser.email : 'guest'
    });
  } catch (error) {
    console.error('[Gemini Copilot API] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
}
