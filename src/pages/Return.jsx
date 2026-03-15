import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, addDoc, doc, getDoc, writeBatch } from 'firebase/firestore';
import { ArrowDownLeft, Search, CheckCircle, Package, RefreshCw, AlertCircle } from 'lucide-react';
import { LoadingSpinner, ErrorDisplay } from '../components/UIStates';

const Return = () => {
    const [assets, setAssets] = useState([]);
    const [filteredAssets, setFilteredAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUser(user);
        });
        fetchInUseAssets();
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredAssets(assets);
        } else {
            const lowerTerm = searchTerm.toLowerCase();
            const filtered = assets.filter(asset =>
                asset.serial_number?.toLowerCase().includes(lowerTerm) ||
                asset.product_name?.toLowerCase().includes(lowerTerm) ||
                asset.current_holder?.toLowerCase().includes(lowerTerm)
            );
            setFilteredAssets(filtered);
        }
    }, [searchTerm, assets]);

    const fetchInUseAssets = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Get all assets with status 'in_use'
            const q = query(collection(db, 'assets'), where('status', '==', 'in_use'));
            const snapshot = await getDocs(q);

            const assetsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // 2. Enrich with product info (name, image)
            // Ideally assets should have product_name denormalized, but let's fetch products to be safe
            // Optimization: Fetch all products once or distinct product IDs
            const productIds = [...new Set(assetsData.map(a => a.product_id).filter(Boolean))];
            const productMap = {};

            // Batch fetch products (parallel)
            await Promise.all(productIds.map(async (pid) => {
                const pDoc = await getDoc(doc(db, 'products', pid));
                if (pDoc.exists()) {
                    productMap[pid] = pDoc.data();
                }
            }));

            const enrichedAssets = assetsData.map(asset => ({
                ...asset,
                product_name: productMap[asset.product_id]?.name || 'Unknown Product',
                product_sku: productMap[asset.product_id]?.sku,
                image_url: productMap[asset.product_id]?.image_url,
                category: productMap[asset.product_id]?.category
            }));

            setAssets(enrichedAssets);
            setFilteredAssets(enrichedAssets);
        } catch (err) {
            console.error('Error fetching returnable assets:', err);
            setError('ไม่สามารถโหลดรายการคืนพัสดุได้: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReturn = async () => {
        if (!selectedAsset) return;
        if (!currentUser) {
            alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');
            return;
        }

        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);

            // 1. Update Asset Status
            const assetRef = doc(db, 'assets', selectedAsset.id);
            batch.update(assetRef, {
                status: 'in_stock',
                current_holder: null,
                updated_at: new Date().toISOString()
            });

            // 2. Update Product Quantity (+1)
            // Manual read-write for logic since we don't have increment imported, 
            // but we can just use the current value from fetch if we trust it, or read fresh.
            // Let's read fresh to be safe.
            const productRef = doc(db, 'products', selectedAsset.product_id);
            const pSnap = await getDoc(productRef);
            if (pSnap.exists()) {
                const currentQty = pSnap.data().quantity || 0;
                batch.update(productRef, { quantity: currentQty + 1 });
            }

            // 3. Create Transaction Record (Type: IN)
            const transactionRef = doc(collection(db, 'transactions'));
            const transactionData = {
                type: 'IN',
                requester_name: selectedAsset.current_holder || 'Unknown',
                approver_name: currentUser.displayName || currentUser.email,
                note: `คืนครุภัณฑ์: ${selectedAsset.serial_number}`,
                created_at: new Date().toISOString(),
                items: [{
                    product_id: selectedAsset.product_id,
                    product_name: selectedAsset.product_name,
                    product_sku: selectedAsset.product_sku,
                    quantity: 1,
                    serialNumbers: [selectedAsset.serial_number]
                }]
            };
            batch.set(transactionRef, transactionData);

            await batch.commit();

            setSuccessMessage(`คืนครุภัณฑ์ ${selectedAsset.serial_number} สำเร็จ!`);
            setSelectedAsset(null);

            // Refresh list
            fetchInUseAssets();

            setTimeout(() => setSuccessMessage(null), 3000);

        } catch (err) {
            console.error('Error processing return:', err);
            alert('เกิดข้อผิดพลาด: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <LoadingSpinner message="กำลังโหลดรายการ..." />;
    if (error) return <ErrorDisplay error={error} onRetry={fetchInUseAssets} />;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-500/20 rounded-xl">
                    <RefreshCw className="text-orange-400" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>คืนพัสดุ/ครุภัณฑ์</h1>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 flex items-center justify-between">
                    <div>
                        <p className="text-gray-400 text-sm">กำลังใช้งาน</p>
                        <p className="text-2xl font-bold text-orange-400">{assets.length}</p>
                    </div>
                    <Package className="text-orange-400/20" size={40} />
                </div>
            </div>

            {/* Search */}
            <div className="glass-card p-4 relative">
                <Search className="absolute left-7 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="ค้นหาเลขครุภัณฑ์, ชื่อสินค้า หรือชื่อผู้ยืม..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="glass-input pl-12 w-full"
                />
            </div>

            {/* Success Message */}
            {successMessage && (
                <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center gap-3 text-green-400 animate-pulse">
                    <CheckCircle size={20} />
                    {successMessage}
                </div>
            )}

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssets.map(asset => (
                    <div
                        key={asset.id}
                        className={`glass-card-hover p-5 cursor-pointer border-2 transition-all duration-300 ${selectedAsset?.id === asset.id
                                ? 'border-orange-500 bg-orange-500/5'
                                : 'border-transparent hover:border-orange-500/30'
                            }`}
                        onClick={() => setSelectedAsset(asset)}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="p-2 bg-white/5 rounded-lg">
                                <Package className="text-gray-400" size={20} />
                            </div>
                            <span className="text-xs font-mono px-2 py-1 bg-white/5 rounded text-gray-400">
                                {asset.serial_number}
                            </span>
                        </div>

                        <h3 className="font-medium mb-1 truncate" style={{ color: "var(--text-primary)" }}>{asset.product_name}</h3>
                        <p className="text-sm text-gray-400 mb-4">ผู้ยืม: {asset.current_holder || '-'}</p>

                        {selectedAsset?.id === asset.id && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleReturn();
                                }}
                                disabled={isSubmitting}
                                className="w-full btn-gradient py-2 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? 'กำลังบันทึก...' : (
                                    <>
                                        <ArrowDownLeft size={16} /> ยืนยันการคืน
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                ))}

                {filteredAssets.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-500">
                        ไม่พบรายการที่ตรงกับเงื่อนไข
                    </div>
                )}
            </div>
        </div>
    );
};

export default Return;
