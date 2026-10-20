import fs from 'node:fs';

const logPath = 'C:/Users/WATCHARA MANADEE/.gemini/antigravity/brain/662c58d8-c397-4926-a0f3-d05b8ab8450c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const item = JSON.parse(line);
    if (item.tool_calls) {
      for (const tc of item.tool_calls) {
        if (tc.name === 'send_message') {
          const msg = typeof tc.args.Message === 'string' ? tc.args.Message : JSON.stringify(tc.args.Message);
          fs.writeFileSync('docs/stockin_audit_report.md', msg, 'utf8');
          console.log('Saved StockIn audit report to docs/stockin_audit_report.md (length: ' + msg.length + ')');
          process.exit(0);
        }
      }
    }
  } catch (err) {
    // continue
  }
}
console.log('send_message not found');
