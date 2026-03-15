import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, Loader2, Package, Search, Plus, Minus, Warehouse, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const TransferModal = ({ isOpen, onClose, warehouses, onComplete }) => {
    const [fromWarehouse, setFromWarehouse] = useState(null);
    const [toWarehouse, setToWarehouse] = useState(null);
    const [products, setProducts] = useState([]);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notes, setNotes] = useState('');

    // Fetch products when from_warehouse changes
    const fetchProducts = useCallback(async () => {
        if (!fromWarehouse) {
            setProducts([]);
            return;
        }

        try {
            setLoading(true);
            const q = query(
                collection(db, 'products'),
                where('warehouse_id', '==', fromWarehouse.id),
                where('quantity', '>', 0)
            );
            const snapshot = await getDocs(q);
            const productList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setProducts(productList);
        } catch (err) {
            console.error('Error fetching products:', err);
            // Sample data fallback if needed or empty
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [fromWarehouse]);

    useEffect(() => {
        fetchProducts();
        setSelectedProducts([]);
    }, [fetchProducts]);

    const handleAddProduct = (product) => {
        if (selectedProducts.find(p => p.id === product.id)) return;
        setSelectedProducts(prev => [...prev, { ...product, transferQty: 1 }]);
    };

    const handleRemoveProduct = (productId) => {
        setSelectedProducts(prev => prev.filter(p => p.id !== productId));
    };

    const handleQtyChange = (productId, delta) => {
        setSelectedProducts(prev => prev.map(p => {
            if (p.id === productId) {
                const newQty = Math.max(1, Math.min(p.quantity, p.transferQty + delta));
                return { ...p, transferQty: newQty };
            }
            return p;
        }));
    };

    const handleTransfer = async () => {
        if (!fromWarehouse || !toWarehouse) {
            setError('กรุณาเลือกคลังต้นทางและปลายทาง');
            return;
        }
        if (fromWarehouse.id === toWarehouse.id) {
            setError('คลังต้นทางและปลายทางต้องไม่เหมือนกัน');
            return;
        }
        if (selectedProducts.length === 0) {
            setError('กรุณาเลือกสินค้าที่จะโอน');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const batch = writeBatch(db);

            // Generate transfer code
            const transferCode = `TRF-${Date.now().toString(36).toUpperCase()}`;

            // Create transfer record (with embedded items)
            const transferRef = doc(collection(db, 'warehouse_transfers'));
            const transferData = {
                transfer_code: transferCode,
                from_warehouse_id: fromWarehouse.id,
                to_warehouse_id: toWarehouse.id,
                status: 'completed',
                notes: notes,
                completed_at: new Date().toISOString(),
                items: selectedProducts.map(p => ({
                    product_id: p.id,
                    product_name: p.name,
                    sku: p.sku,
                    quantity: p.transferQty
                }))
            };
            batch.set(transferRef, transferData);

            // Process products
            for (const product of selectedProducts) {
                // 1. Update source warehouse quantity
                const sourceProductRef = doc(db, 'products', product.id);
                batch.update(sourceProductRef, {
                    quantity: product.quantity - product.transferQty
                });

                // 2. Update/Create destination warehouse product
                // We need to query first to see if it exists
                // Note: We can't do this inside the batch commit directly if dependent on read.
                // We must read before batching or read here.
                const destQuery = query(
                    collection(db, 'products'),
                    where('warehouse_id', '==', toWarehouse.id),
                    where('sku', '==', product.sku)
                );
                const destSnapshot = await getDocs(destQuery);

                if (!destSnapshot.empty) {
                    // Update existing
                    const destDoc = destSnapshot.docs[0];
                    const currentQty = destDoc.data().quantity || 0;
                    batch.update(destDoc.ref, {
                        quantity: currentQty + product.transferQty
                    });
                } else {
                    // Create new
                    const newProductRef = doc(collection(db, 'products'));
                    const newProductData = {
                        ...product,
                        id: undefined, // remove source ID
                        warehouse_id: toWarehouse.id,
                        quantity: product.transferQty,
                        created_at: new Date().toISOString()
                    };
                    // Remove internal fields if any
                    delete newProductData.transferQty;
                    delete newProductData.id;

                    batch.set(newProductRef, newProductData);
                }
            }

            await batch.commit();

            alert(`โอนย้ายสำเร็จ! รหัส: ${transferCode}`);
            onComplete?.();
            onClose();
        } catch (err) {
            console.error('Transfer error:', err);
            setError('เกิดข้อผิดพลาดในการโอนย้าย: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <ArrowRight className="text-orange-600" size={20} />
                        </div>
                        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            โอนย้ายสินค้าระหว่างคลัง
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    {/* Warehouse Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* From Warehouse */}
                        <div>
                            <label className="form-label">จากคลัง (ต้นทาง)</label>
                            <select
                                value={fromWarehouse?.id || ''}
                                onChange={(e) => {
                                    const wh = warehouses.find(w => w.id === parseInt(e.target.value));
                                    setFromWarehouse(wh || null);
                                }}
                                className="glass-select w-full"
                            >
                                <option value="">-- เลือกคลังต้นทาง --</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id} disabled={wh.id === toWarehouse?.id}>
                                        [{wh.code}] {wh.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* To Warehouse */}
                        <div>
                            <label className="form-label">ไปยังคลัง (ปลายทาง)</label>
                            <select
                                value={toWarehouse?.id || ''}
                                onChange={(e) => {
                                    const wh = warehouses.find(w => w.id === parseInt(e.target.value));
                                    setToWarehouse(wh || null);
                                }}
                                className="glass-select w-full"
                            >
                                <option value="">-- เลือกคลังปลายทาง --</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id} disabled={wh.id === fromWarehouse?.id}>
                                        [{wh.code}] {wh.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Transfer Direction Arrow */}
                    {fromWarehouse && toWarehouse && (
                        <div className="flex items-center justify-center gap-4 py-3 bg-orange-50 rounded-xl">
                            <div className="flex items-center gap-2">
                                <Warehouse className="text-orange-600" size={18} />
                                <span className="font-medium text-orange-700">{fromWarehouse.name}</span>
                            </div>
                            <ArrowRight className="text-orange-500" size={24} />
                            <div className="flex items-center gap-2">
                                <Warehouse className="text-orange-600" size={18} />
                                <span className="font-medium text-orange-700">{toWarehouse.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Product Selection */}
                    {fromWarehouse && (
                        <div>
                            <label className="form-label">เลือกสินค้าที่จะโอน</label>

                            {/* Search */}
                            <div className="relative mb-3">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="ค้นหาสินค้า..."
                                    className="glass-input pl-11 w-full"
                                />
                            </div>

                            {/* Product List */}
                            <div className="max-h-40 overflow-y-auto border rounded-xl" style={{ borderColor: 'var(--border-color)' }}>
                                {loading ? (
                                    <div className="p-4 text-center text-gray-500">กำลังโหลด...</div>
                                ) : filteredProducts.length > 0 ? (
                                    filteredProducts.map(product => (
                                        <div
                                            key={product.id}
                                            className={`flex items-center justify-between p-3 hover:bg-gray-50 border-b last:border-0 ${selectedProducts.find(p => p.id === product.id) ? 'bg-orange-50' : ''
                                                }`}
                                            style={{ borderColor: 'var(--border-color)' }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Package className="text-gray-400" size={16} />
                                                <div>
                                                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                                        {product.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{product.sku} • คงเหลือ: {product.quantity}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAddProduct(product)}
                                                disabled={selectedProducts.find(p => p.id === product.id)}
                                                className="px-3 py-1 text-sm bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-gray-500">ไม่พบสินค้า</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Selected Products */}
                    {selectedProducts.length > 0 && (
                        <div>
                            <label className="form-label">สินค้าที่จะโอน ({selectedProducts.length} รายการ)</label>
                            <div className="space-y-2">
                                {selectedProducts.map(product => (
                                    <div
                                        key={product.id}
                                        className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-xl"
                                    >
                                        <div>
                                            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                                {product.name}
                                            </p>
                                            <p className="text-xs text-gray-500">คงเหลือ: {product.quantity}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleQtyChange(product.id, -1)}
                                                className="p-1 bg-white rounded-lg hover:bg-gray-100"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="w-10 text-center font-bold">{product.transferQty}</span>
                                            <button
                                                onClick={() => handleQtyChange(product.id, 1)}
                                                className="p-1 bg-white rounded-lg hover:bg-gray-100"
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveProduct(product.id)}
                                                className="p-1 ml-2 text-red-500 hover:bg-red-100 rounded-lg"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="form-label">หมายเหตุ</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="glass-input w-full h-20 resize-none"
                            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-6 border-t shrink-0" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                        ยกเลิก
                    </button>
                    <button
                        onClick={handleTransfer}
                        disabled={saving || selectedProducts.length === 0}
                        className="flex-1 btn-gradient flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                กาลังโอน...
                            </>
                        ) : (
                            <>
                                <ArrowRight size={18} />
                                ยืนยันโอนย้าย
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransferModal;
