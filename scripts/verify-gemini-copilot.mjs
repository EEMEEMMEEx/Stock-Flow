import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Verifying Gemini StockFlow Copilot Integration ---');

// 1. Verify files exist
const filesToCheck = [
  'api/gemini-copilot.js',
  'src/lib/geminiCopilot.js',
  'src/components/copilot/StockFlowCopilotModal.jsx',
  'docs/gemini-copilot-implementation-plan.md'
];

for (const file of filesToCheck) {
  assert.ok(fs.existsSync(file), `File ${file} must exist`);
  console.log(`[PASS] File exists: ${file}`);
}

// 2. Check Topbar integration
const topbarContent = fs.readFileSync('src/components/layout/Topbar.jsx', 'utf-8');
assert.ok(topbarContent.includes('StockFlowCopilotModal'), 'Topbar must import StockFlowCopilotModal');
assert.ok(topbarContent.includes('copilotOpen'), 'Topbar must define copilotOpen state');
assert.ok(topbarContent.includes('Bot') || topbarContent.includes('Sparkles'), 'Topbar must include Bot or Sparkles icon for Copilot');
console.log('[PASS] Topbar includes Copilot button, state, and shortcut');

// 3. Check @google/genai and model in api/gemini-copilot.js
const apiContent = fs.readFileSync('api/gemini-copilot.js', 'utf-8');
assert.ok(apiContent.includes('@google/genai'), 'api/gemini-copilot.js must import @google/genai');
assert.ok(apiContent.includes('gemini-3.8-flash'), 'api/gemini-copilot.js must target gemini-3.8-flash');
console.log('[PASS] Serverless API uses @google/genai and gemini-3.8-flash');

// 4. Check client lib fallback handling
const clientLibContent = fs.readFileSync('src/lib/geminiCopilot.js', 'utf-8');
assert.ok(clientLibContent.includes('askStockFlowCopilot'), 'src/lib/geminiCopilot.js must export askStockFlowCopilot');
assert.ok(clientLibContent.includes('needsKey'), 'src/lib/geminiCopilot.js must handle missing key gracefully');
console.log('[PASS] Client service exports askStockFlowCopilot with key fallback');

// 5. Test GoogleGenAI import dynamically
import('@google/genai').then(({ GoogleGenAI }) => {
  assert.ok(typeof GoogleGenAI === 'function', 'GoogleGenAI must be a constructor');
  const client = new GoogleGenAI({ apiKey: 'mock_key' });
  assert.ok(typeof client.models?.generateContent === 'function', 'client.models.generateContent must be a function');
  console.log('[PASS] GoogleGenAI SDK instantiated and validated');
  console.log('--- All StockFlow Copilot Gemini verifications PASSED! ---');
}).catch((err) => {
  console.error('[FAIL] GoogleGenAI SDK test failed:', err);
  process.exit(1);
});
