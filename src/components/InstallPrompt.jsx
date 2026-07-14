import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

    // If it's already installed or running in standalone mode, don't show
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      return;
    }

    // iOS doesn't support beforeinstallprompt, so we just show the guide manually if not standalone
    if (isIosDevice) {
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setTimeout(() => setShowPrompt(true), 3000); // Show after 3 seconds
      }
    }

    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <Card className="p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 p-2 rounded-xl text-primary shrink-0">
            <Download className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">ติดตั้งแอปลงเครื่อง</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              ติดตั้งแอปเพื่อความรวดเร็วในการใช้งาน และสามารถเข้าถึงผ่านหน้าจอมือถือได้ทันที
            </p>
            
            {isIOS ? (
              <div className="text-xs bg-muted p-2 rounded-md">
                <strong>วิธีติดตั้งบน iOS:</strong> แตะปุ่ม Share (แชร์) ด้านล่าง แล้วเลือก <br/> 
                <span className="font-semibold text-primary">"Add to Home Screen"</span>
              </div>
            ) : (
              <Button size="sm" className="w-full" onClick={handleInstall}>
                ติดตั้งแอปทันที
              </Button>
            )}
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default InstallPrompt;
