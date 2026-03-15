import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    QrCode, Search, ShoppingCart, Camera, CameraOff, CheckCircle, AlertCircle,
    History, Zap, Edit3, ArrowRight, SwitchCamera, Flashlight, WifiOff, RefreshCw
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { useStore } from '../store/useStore';

const Scan = () => {
    const navigate = useNavigate();
    const { addToCart, cart } = useStore();
    const [scanMode, setScanMode] = useState('search'); // 'search' or 'cart'
    const [scanning, setScanning] = useState(false);
    const [message, setMessage] = useState(null);
    const [lastScanned, setLastScanned] = useState(null);
    const [scanHistory, setScanHistory] = useState([]);
    const [scanCount, setScanCount] = useState(0);
    const [scannedValue, setScannedValue] = useState('');
    const [showScannedResult, setShowScannedResult] = useState(false);

    // Camera improvements
    const [cameras, setCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [torchEnabled, setTorchEnabled] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState([]);

    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);

    // Check online status
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Load offline queue from localStorage
        const savedQueue = localStorage.getItem('scan-offline-queue');
        if (savedQueue) {
            setOfflineQueue(JSON.parse(savedQueue));
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Get available cameras
    useEffect(() => {
        Html5Qrcode.getCameras()
            .then(devices => {
                setCameras(devices);
                // Default to back camera
                const backCamera = devices.find(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('environment') ||
                    d.label.toLowerCase().includes('rear')
                );
                setSelectedCamera(backCamera?.id || devices[0]?.id);
            })
            .catch(err => console.log('Cannot get cameras:', err));
    }, []);

    // Stop scanning function
    const stopScanning = useCallback(async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            try {
                await html5QrCodeRef.current.stop();
                html5QrCodeRef.current.clear();
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
        setScanning(false);
        setTorchEnabled(false);
        setTorchSupported(false);
    }, []);

    useEffect(() => {
        return () => {
            stopScanning();
        };
    }, [stopScanning]);

    const startScanning = async () => {
        try {
            html5QrCodeRef.current = new Html5Qrcode("qr-reader");

            const config = {
                fps: 15,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                disableFlip: false
            };

            // Use selected camera or default to environment
            const cameraConfig = selectedCamera
                ? { deviceId: { exact: selectedCamera } }
                : { facingMode: "environment" };

            await html5QrCodeRef.current.start(
                cameraConfig,
                config,
                onScanSuccess,
                onScanFailure
            );

            setScanning(true);
            setMessage(null);

            // Check torch support
            try {
                const capabilities = await html5QrCodeRef.current.getRunningTrackCapabilities();
                setTorchSupported(!!capabilities?.torch);
            } catch {
                setTorchSupported(false);
            }
        } catch (err) {
            console.error('Error starting scanner:', err);
            setMessage({ type: 'error', text: 'ไม่สามารถเปิดกล้องได้: ' + err.message });
        }
    };

    // Toggle torch/flashlight
    const toggleTorch = async () => {
        if (!html5QrCodeRef.current || !torchSupported) return;

        try {
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ torch: !torchEnabled }]
            });
            setTorchEnabled(!torchEnabled);
        } catch (err) {
            console.error('Torch toggle error:', err);
        }
    };

    // Switch camera
    const switchCamera = async () => {
        if (cameras.length < 2) return;

        const currentIndex = cameras.findIndex(c => c.id === selectedCamera);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCamera = cameras[nextIndex];

        setSelectedCamera(nextCamera.id);

        if (scanning) {
            await stopScanning();
            setTimeout(() => startScanning(), 300);
        }
    };

    const onScanSuccess = async (decodedText) => {
        if (lastScanned === decodedText) return;
        setLastScanned(decodedText);
        setScanCount(prev => prev + 1);

        setScanHistory(prev => [
            { code: decodedText, time: new Date(), mode: scanMode },
            ...prev.slice(0, 4)
        ]);

        if (navigator.vibrate) navigator.vibrate(200);

        if (scanMode === 'search') {
            await stopScanning();
            setScannedValue(decodedText);
            setShowScannedResult(true);
            setMessage({ type: 'success', text: `สแกนสำเร็จ! ตรวจสอบหรือแก้ไขรหัสก่อนค้นหา` });
        } else {
            if (isOffline) {
                // Queue for offline
                const newQueue = [...offlineQueue, { code: decodedText, timestamp: Date.now() }];
                setOfflineQueue(newQueue);
                localStorage.setItem('scan-offline-queue', JSON.stringify(newQueue));
                setMessage({ type: 'warning', text: `บันทึก "${decodedText}" ไว้ในคิว (Offline)` });
            } else {
                await handleAddToCart(decodedText);
            }
        }

        setTimeout(() => setLastScanned(null), 2000);
    };

    // Process offline queue when back online
    const processOfflineQueue = async () => {
        if (offlineQueue.length === 0) return;

        setMessage({ type: 'info', text: `กำลังประมวลผล ${offlineQueue.length} รายการ...` });

        for (const item of offlineQueue) {
            await handleAddToCart(item.code);
        }

        setOfflineQueue([]);
        localStorage.removeItem('scan-offline-queue');
        setMessage({ type: 'success', text: 'ประมวลผลรายการออฟไลน์เสร็จสิ้น!' });
    };

    const handleSearch = () => {
        if (scannedValue.trim()) {
            navigate(`/assets?search=${encodeURIComponent(scannedValue.trim())}`);
        }
    };

    const handleSearchToCart = async () => {
        if (scannedValue.trim()) {
            await handleAddToCart(scannedValue.trim());
        }
    };

    const clearScannedResult = () => {
        setScannedValue('');
        setShowScannedResult(false);
        setMessage(null);
    };

    const onScanFailure = () => { };

    const handleAddToCart = async (serialNumber) => {
        try {
            // Find asset by serial number
            const q = query(collection(db, 'assets'), where('serial_number', '==', serialNumber));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setMessage({ type: 'error', text: `ไม่พบครุภัณฑ์หมายเลข "${serialNumber}"` });
                return;
            }

            const assetDoc = snapshot.docs[0];
            const assetData = assetDoc.data();
            const asset = { id: assetDoc.id, ...assetData };

            if (asset.status !== 'in_stock') {
                setMessage({ type: 'error', text: `ครุภัณฑ์นี้ไม่พร้อมใช้งาน (สถานะ: ${asset.status})` });
                return;
            }

            // Fetch product details
            // Supabase used a join, Firestore needs manual fetch if not denormalized
            // Assuming we fetch product separately or rely on context
            // But we need the product object for addToCart(product)

            let product;
            if (asset.product_id) {
                const productDoc = await getDoc(doc(db, 'products', asset.product_id));
                if (productDoc.exists()) {
                    product = { id: productDoc.id, ...productDoc.data() };
                }
            }

            if (product) {
                // Attach asset info or handle implicitly?
                // addToCart usually takes a product object.
                addToCart(product);
                setMessage({ type: 'success', text: `เพิ่ม "${product.name}" ลงตะกร้าแล้ว!` });
            } else {
                setMessage({ type: 'error', text: `ไม่พบข้อมูลสินค้าสำหรับครุภัณฑ์นี้` });
            }

        } catch (err) {
            console.error('Error adding to cart:', err);
            setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + err.message });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/20 rounded-xl">
                        <QrCode className="text-purple-400" size={28} />
                    </div>
                    <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>สแกน QR Code</h1>
                </div>

                {/* Offline indicator */}
                {isOffline && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-500 rounded-lg text-sm">
                        <WifiOff size={16} />
                        <span>Offline Mode</span>
                    </div>
                )}
            </div>

            {/* Offline Queue */}
            {offlineQueue.length > 0 && !isOffline && (
                <div className="glass-card p-4 border border-yellow-500/30 bg-yellow-500/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <WifiOff className="text-yellow-500" size={20} />
                            <span style={{ color: "var(--text-primary)" }}>
                                {offlineQueue.length} รายการรอประมวลผล
                            </span>
                        </div>
                        <button
                            onClick={processOfflineQueue}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg flex items-center gap-2 hover:bg-yellow-600 transition-colors"
                        >
                            <RefreshCw size={16} />
                            ประมวลผล
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Zap className="text-purple-400" size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">สแกนวันนี้</p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{scanCount}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                        <ShoppingCart className="text-green-400" size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">ในตะกร้า</p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{cart.length}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3 md:col-span-2">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <History className="text-blue-400" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">ล่าสุด</p>
                        <p className="text-sm font-mono truncate" style={{ color: "var(--text-primary)" }}>
                            {scanHistory[0]?.code || '-'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Mode Selector */}
            <div className="glass-card p-4">
                <div className="flex gap-3">
                    <button
                        onClick={() => setScanMode('search')}
                        className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 transform ${scanMode === 'search'
                            ? 'bg-gradient-to-r from-[#1C6CB4] to-blue-500 text-white shadow-lg shadow-[#1C6CB4]/30 scale-[1.02]'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:scale-[1.01]'
                            }`}
                    >
                        <Search size={20} />
                        <span className="font-medium">สแกนเพื่อค้นหา</span>
                    </button>
                    <button
                        onClick={() => setScanMode('cart')}
                        className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 transform ${scanMode === 'cart'
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30 scale-[1.02]'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:scale-[1.01]'
                            }`}
                    >
                        <ShoppingCart size={20} />
                        <span className="font-medium">สแกนใส่ตะกร้า</span>
                    </button>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-xl flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200'
                    : message.type === 'warning' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                        : message.type === 'info' ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'bg-red-100 text-red-700 border border-red-200'
                    }`}>
                    {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {message.text}
                </div>
            )}

            {/* Scanned Result Section */}
            {showScannedResult && (
                <div className="glass-card p-6 border-2 border-purple-200">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Edit3 className="text-purple-600" size={20} />
                        </div>
                        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>ผลการสแกน</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-500 mb-2">รหัสที่สแกนได้ (สามารถแก้ไขได้)</label>
                            <input
                                type="text"
                                value={scannedValue}
                                onChange={(e) => setScannedValue(e.target.value)}
                                className="glass-input font-mono text-lg w-full"
                                placeholder="กรอกหรือแก้ไขรหัส..."
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleSearch}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-[#1C6CB4] to-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30"
                            >
                                <Search size={18} />
                                ค้นหาครุภัณฑ์
                                <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={handleSearchToCart}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/30"
                            >
                                <ShoppingCart size={18} />
                                เพิ่มลงตะกร้า
                            </button>
                        </div>

                        <button
                            onClick={clearScannedResult}
                            className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm"
                        >
                            ล้างและสแกนใหม่
                        </button>
                    </div>
                </div>
            )}

            {/* Scanner Area */}
            <div className="glass-card p-6">
                {/* Camera Controls */}
                {scanning && (
                    <div className="flex justify-center gap-3 mb-4">
                        {cameras.length > 1 && (
                            <button
                                onClick={switchCamera}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl flex items-center gap-2 hover:bg-gray-200 transition-colors"
                            >
                                <SwitchCamera size={18} />
                                <span className="hidden sm:inline">สลับกล้อง</span>
                            </button>
                        )}
                        {torchSupported && (
                            <button
                                onClick={toggleTorch}
                                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${torchEnabled
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <Flashlight size={18} />
                                <span className="hidden sm:inline">{torchEnabled ? 'ปิดไฟ' : 'เปิดไฟ'}</span>
                            </button>
                        )}
                    </div>
                )}

                <div
                    id="qr-reader"
                    ref={scannerRef}
                    className="w-full max-w-md mx-auto rounded-xl overflow-hidden bg-black/10 border"
                    style={{
                        minHeight: scanning ? '300px' : '0',
                        borderColor: 'var(--border-color)'
                    }}
                />

                {!scanning && (
                    <div className="text-center py-12">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-purple-100 flex items-center justify-center">
                            <Camera className="h-12 w-12 text-purple-500" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>พร้อมสแกน</h3>
                        <p className="text-gray-500 mb-6">กดปุ่มด้านล่างเพื่อเปิดกล้อง</p>
                    </div>
                )}

                <div className="mt-6 flex justify-center">
                    {!scanning ? (
                        <button
                            onClick={startScanning}
                            className="px-8 py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium flex items-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/30 hover:scale-105"
                        >
                            <Camera size={20} />
                            เปิดกล้องสแกน
                        </button>
                    ) : (
                        <button
                            onClick={stopScanning}
                            className="px-8 py-3.5 bg-red-100 text-red-600 border border-red-200 rounded-xl font-medium flex items-center gap-2 transition-all duration-300 hover:bg-red-200"
                        >
                            <CameraOff size={20} />
                            ปิดกล้อง
                        </button>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="glass-card p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <span className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs">?</span>
                    วิธีใช้งาน
                </h3>
                <ul className="text-sm text-gray-500 space-y-2">
                    <li className="flex items-start gap-2"><span className="text-purple-500">•</span> เลือกโหมด "ค้นหา" หรือ "ใส่ตะกร้า"</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500">•</span> กดปุ่มเปิดกล้องและอนุญาตการเข้าถึง</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500">•</span> เล็ง QR Code ให้อยู่ในกรอบสี่เหลี่ยม</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500">•</span> ใช้ปุ่มสลับกล้อง/เปิดไฟ ช่วยในที่มืด</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500">•</span> รองรับ Offline Mode - สแกนได้แม้ไม่มีเน็ต</li>
                </ul>
            </div>
        </div>
    );
};

export default Scan;
