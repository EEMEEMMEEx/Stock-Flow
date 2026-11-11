import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import StockFlowCopilotModal from './StockFlowCopilotModal';

export default function StockFlowCopilotFab() {
  const [open, setOpen] = useState(false);
  const [copilotEnabled, setCopilotEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('stockflow_copilot_enabled') !== 'false';
    }
    return true;
  });

  // Sync Copilot enabled state from system settings and listen for live toggles
  useEffect(() => {
    let isMounted = true;
    const syncCopilotState = async () => {
      try {
        const { data } = await supabase.rpc('admin_get_system_settings');
        if (isMounted && data && data.enable_copilot !== undefined) {
          const enabled = Boolean(data.enable_copilot);
          setCopilotEnabled(enabled);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('stockflow_copilot_enabled', String(enabled));
          }
        }
      } catch {
        // Fallback to local or default
      }
    };

    syncCopilotState();

    const handleToggleEvent = (e) => {
      if (e.detail?.enabled !== undefined) {
        setCopilotEnabled(Boolean(e.detail.enabled));
      }
    };

    window.addEventListener('stockflow:copilot-toggle', handleToggleEvent);
    window.addEventListener('stockflow:settings-updated', syncCopilotState);

    return () => {
      isMounted = false;
      window.removeEventListener('stockflow:copilot-toggle', handleToggleEvent);
      window.removeEventListener('stockflow:settings-updated', syncCopilotState);
    };
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K to toggle StockFlow Copilot
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!copilotEnabled) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copilotEnabled]);

  if (!copilotEnabled) {
    return null;
  }

  return (
    <>
      {/* Floating Action Button strictly following DESIGN.md Quiet Chrome & 4px Grid */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="StockFlow Copilot (Ctrl+K)"
        aria-label="StockFlow Copilot (Ctrl+K)"
        className="fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
      >
        <Bot className="h-[19px] w-[19px] text-amber-500 dark:text-amber-400" />
        <span className="sr-only">StockFlow Copilot</span>
      </button>

      {/* Copilot Dialog */}
      <StockFlowCopilotModal open={open} onOpenChange={setOpen} />
    </>
  );
}
