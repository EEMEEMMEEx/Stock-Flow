import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Send,
  RefreshCw,
  Copy,
  Check,
  Settings2,
  ExternalLink,
  Bot,
  User,
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  askStockFlowCopilot,
  getGeminiApiKey,
  saveGeminiApiKey
} from '@/lib/geminiCopilot';

const QUICK_PROMPTS = [
  { label: '📦 สต็อกใกล้หมด', query: 'ตรวจสอบรายการพัสดุที่มีสต็อกต่ำกว่าเกณฑ์หรือใกล้หมดในแต่ละคลัง พร้อมสรุปรายการด่วน' },
  { label: '🏢 ภาพรวมรายคลัง', query: 'สรุปภาพรวมยอดคงเหลือพัสดุแยกตามคลังสินค้าและโครงการทั้งหมด' },
  { label: '🔄 รายการเบิกล่าสุด', query: 'สรุปรายการเบิกจ่ายพัสดุล่าสุด มีโครงการใดเบิกอะไรไปบ้างและสถานะเป็นอย่างไร' },
  { label: '⚠️ แนะนำการจัดซื้อ', query: 'วิเคราะห์แนวโน้มสต็อกและให้คำแนะนำการสั่งซื้อเพิ่มเติมหรือการเกลี่ยพัสดุระหว่างคลัง' },
];

/**
 * Format markdown text safely into React elements
 */
function FormattedMarkdown({ content }) {
  if (!content) return null;

  // Split lines
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed break-words">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Empty lines
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headings
        if (trimmed.startsWith('### ')) {
          return <h4 key={idx} className="text-sm font-bold text-foreground mt-2">{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={idx} className="text-base font-bold text-primary mt-2">{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith('# ')) {
          return <h2 key={idx} className="text-lg font-bold text-primary mt-2.5">{trimmed.slice(2)}</h2>;
        }

        // Bullet lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.slice(2);
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-primary font-bold select-none">•</span>
              <span className="flex-1">{renderInlineStyles(itemText)}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-primary font-semibold text-xs min-w-[1.2rem] select-none">{numMatch[1]}.</span>
              <span className="flex-1">{renderInlineStyles(numMatch[2])}</span>
            </div>
          );
        }

        // Table row representation
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
          const isSeparator = cells.every(c => /^[-:]+$/.test(c));
          if (isSeparator) return null;
          return (
            <div key={idx} className="grid grid-flow-col auto-cols-fr gap-2 py-1 px-2 border-b border-border/40 text-xs font-mono bg-muted/20 rounded">
              {cells.map((cell, cIdx) => (
                <div key={cIdx} className="truncate">{renderInlineStyles(cell)}</div>
              ))}
            </div>
          );
        }

        // Default paragraph
        return <p key={idx}>{renderInlineStyles(trimmed)}</p>;
      })}
    </div>
  );
}

/**
 * Basic inline styles: **bold**, `code`, [link](url)
 */
function renderInlineStyles(text) {
  // Regex splitting by bold, code, and links
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
    // Inline code `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find the earliest match
    const matches = [
      boldMatch ? { type: 'bold', index: boldMatch.index, length: boldMatch[0].length, content: boldMatch[1] } : null,
      codeMatch ? { type: 'code', index: codeMatch.index, length: codeMatch[0].length, content: codeMatch[1] } : null,
      linkMatch ? { type: 'link', index: linkMatch.index, length: linkMatch[0].length, text: linkMatch[1], url: linkMatch[2] } : null,
    ].filter(Boolean).sort((a, b) => a.index - b.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0];
    if (first.index > 0) {
      parts.push(remaining.substring(0, first.index));
    }

    if (first.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{first.content}</strong>);
    } else if (first.type === 'code') {
      parts.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary">{first.content}</code>);
    } else if (first.type === 'link') {
      parts.push(
        <a key={key++} href={first.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium inline-flex items-center gap-0.5">
          {first.text}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
      );
    }

    remaining = remaining.substring(first.index + first.length);
  }

  return parts;
}

export default function StockFlowCopilotModal({ open, onOpenChange }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'สวัสดีครับ! ผมคือ **StockFlow Copilot** ขับเคลื่อนด้วย **Google Gemini 3.8 Flash**\n\nคุณสามารถสอบถามสถานะคลังสินค้า ตรวจสอบสต็อกพัสดุใกล้หมด หรือขอคำแนะนำการสั่งซื้อและกระจายสต็อกได้ทันทีครับ',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      const existing = getGeminiApiKey();
      setHasApiKey(Boolean(existing));
      setCustomKey(existing || '');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (queryToSend) => {
    const text = (queryToSend || input).trim();
    if (!text || isLoading) return;

    setInput('');
    const newMsg = { role: 'user', content: text, timestamp: new Date() };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const history = updatedMessages.map(m => ({
        role: m.role,
        text: m.content
      }));

      const res = await askStockFlowCopilot({
        query: text,
        conversationHistory: history
      });

      if (res.needsKey) {
        setShowKeyConfig(true);
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          timestamp: new Date(),
          source: res.source,
          model: res.model
        }
      ]);
    } catch (err) {
      toast.error('ไม่สามารถดึงข้อมูลจาก Gemini API ได้: ' + (err.message || ''));
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ เกิดข้อผิดพลาดในการประมวลผล: ${err.message || 'กรุณาลองใหม่อีกครั้ง'}`,
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    toast.success('คัดลอกคำตอบแล้ว');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveKey = () => {
    saveGeminiApiKey(customKey);
    setHasApiKey(Boolean(customKey.trim()));
    setShowKeyConfig(false);
    toast.success(customKey.trim() ? 'บันทึก Gemini API Key เรียบร้อยแล้ว' : 'ลบการตั้งค่า API Key แล้ว');
  };

  const handleClearHistory = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'ล้างประวัติการสนทนาแล้วครับ มีอะไรเกี่ยวกับคลังสินค้าให้ช่วยตรวจสอบไหมครับ?',
        timestamp: new Date()
      }
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-h-[85vh] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-border bg-card">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border bg-card/60 backdrop-blur-xs flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs">
              <Sparkles className="h-5 w-5 animate-pulse text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold">StockFlow Copilot</DialogTitle>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Gemini 3.8 Flash
                </span>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                ผู้ช่วยวิเคราะห์และค้นหาข้อมูลคลังสินค้าอัจฉริยะ (Free Tier Supported)
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-1 mr-6">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="ตั้งค่า Gemini API Key"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="ล้างการสนทนา"
              onClick={handleClearHistory}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* API Key Configuration Panel */}
        {showKeyConfig && (
          <div className="p-3.5 bg-accent/40 border-b border-border text-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                การตั้งค่า Google Gemini API Key
                {hasApiKey ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium ml-1">● เชื่อมต่อแล้ว</span>
                ) : (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium ml-1">○ ยังไม่มี Key</span>
                )}
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1 font-medium"
              >
                รับ API Key ฟรี (Google AI Studio) <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-muted-foreground leading-normal">
              สามารถกรอก Gemini API Key ส่วนตัว (บันทึกลงในเบราว์เซอร์ของคุณอย่างปลอดภัย) หรือระบุในไฟล์ <code>.env</code> เป็น <code>VITE_GEMINI_API_KEY</code>
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="AIzaSy..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <Button size="sm" onClick={handleSaveKey} className="h-8 text-xs shrink-0">
                บันทึก Key
              </Button>
            </div>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={index}
                className={cn('flex items-start gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
              >
                {/* Avatar Icon */}
                <div
                  className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs',
                    isUser
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted border border-border text-primary'
                  )}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={cn(
                    'group relative max-w-[85%] rounded-2xl px-4 py-3 shadow-xs',
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-xs'
                      : 'bg-muted/40 border border-border/80 text-foreground rounded-tl-xs'
                  )}
                >
                  <FormattedMarkdown content={msg.content} />

                  {/* Message Action Footer (for Assistant) */}
                  {!isUser && (
                    <div className="mt-2.5 pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono text-[10px]">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        {msg.model || 'gemini-3.8-flash'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-80 hover:opacity-100"
                        title="คัดลอกข้อความ"
                        onClick={() => handleCopy(msg.content, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking / Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-full bg-muted border border-border text-primary flex items-center justify-center">
                <Bot className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="bg-muted/40 border border-border/80 rounded-2xl rounded-tl-xs px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-bounce" />
                <span>กำลังวิเคราะห์ข้อมูลคลังสินค้าด้วย Gemini 3.8 Flash...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-border/60 bg-card/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSend(item.query)}
              className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 border-t border-border bg-card flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ถามคำถามเกี่ยวกับสต็อก เช่น 'มีสายแลนเหลือที่คลังไหนบ้าง?'..."
            disabled={isLoading}
            className="flex-1 text-sm bg-background"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="shrink-0 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">ส่ง</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
