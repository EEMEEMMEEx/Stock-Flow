import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Zap, WifiOff, Bell } from 'lucide-react';

const InstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if dismissed recently
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const dismissedTime = parseInt(dismissed, 10);
            // Don't show for 7 days after dismissal
            if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
                return;
            }
        }

        // Listen for beforeinstallprompt event
        const handleBeforeInstall = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Show after a delay
            setTimeout(() => setShowPrompt(true), 3000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        // Listen for successful installation
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setIsInstalled(true);
        }

        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    };

    if (isInstalled || !showPrompt) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 animate-in slide-in-from-bottom duration-500">
            <div className="glass-card p-5 shadow-2xl border" style={{ borderColor: 'var(--border-color)' }}>
                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-[#1C6CB4] to-[#ED2229] rounded-xl">
                        <Smartphone className="text-white" size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                            ติดตั้ง StockFlow
                        </h3>
                        <p className="text-sm text-gray-500">
                            เพิ่มแอปลงในหน้าจอหลัก
                        </p>
                    </div>
                </div>

                {/* Features */}
                <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Zap className="text-yellow-500" size={16} />
                        <span>เปิดใช้งานได้เร็วขึ้น</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <WifiOff className="text-blue-500" size={16} />
                        <span>ใช้งานแบบ Offline ได้</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Bell className="text-purple-500" size={16} />
                        <span>รับการแจ้งเตือนทันที</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-2.5 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                        ไว้ทีหลัง
                    </button>
                    <button
                        onClick={handleInstall}
                        className="flex-1 py-2.5 btn-gradient flex items-center justify-center gap-2"
                    >
                        <Download size={18} />
                        ติดตั้ง
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
