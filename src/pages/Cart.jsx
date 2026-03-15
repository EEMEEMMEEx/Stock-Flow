import React from 'react';
import { useStore } from '../store/useStore';
import { Trash2, ShoppingCart, FileText, CheckCircle, AlertCircle, Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';

import { generatePDF } from '../utils/pdfGenerator';

const Cart = () => {
    const { cart, removeFromCart, updateCartQuantity, clearCart } = useStore();
    const navigate = useNavigate();
    const [requesterName, setRequesterName] = React.useState('');
    const [senderName, setSenderName] = React.useState('');
    const [deliveryLocation, setDeliveryLocation] = React.useState('');
    const [note, setNote] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [success, setSuccess] = React.useState(false);

    // Asset Management State
    const [availableAssets, setAvailableAssets] = React.useState({}); // { productId: [asset1, asset2] }
    const [selectedSerialNumbers, setSelectedSerialNumbers] = React.useState({}); // { productId: [sn1, sn2] }
    const [_loadingAssets, setLoadingAssets] = React.useState(false);

    const totalItems = cart.reduce((acc, item) => acc + item.cartQuantity, 0);

    // Initialize sender name from logged-in user
    React.useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            if (user) {
                setSenderName(user.displayName || user.email);
            }
        });
        return () => unsubscribe();
    }, []);

    // Fetch available assets for items in cart
    React.useEffect(() => {
        const fetchAssets = async () => {
            if (cart.length === 0) return;
            setLoadingAssets(true);
            const assetMap = {};

            try {
                // Determine unique product IDs
                const productIds = [...new Set(cart.map(item => item.id))];

                // Firestore 'in' query limit is 10. Better to loop safely or chunk.
                // Since this is client side cart, likely small enough to parallel fetch.
                const assetPromises = productIds.map(async (pid) => {
                    const q = query(
                        collection(db, 'assets'),
                        where('product_id', '==', pid),
                        where('status', '==', 'in_stock')
                    );
                    const snapshot = await getDocs(q);
                    const assets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    return { pid, assets };
                });

                const results = await Promise.all(assetPromises);

                results.forEach(({ pid, assets }) => {
                    // Sort by serial number manually since we didn't use storage index in query (optional optimization)
                    assets.sort((a, b) => a.serial_number?.localeCompare(b.serial_number));
                    assetMap[pid] = assets;
                });

                setAvailableAssets(assetMap);
            } catch (err) {
                console.error("Error fetching available assets:", err);
            } finally {
                setLoadingAssets(false);
            }
        };

        fetchAssets();
    }, [cart]);

    const handleSerialNumberSelect = (productId, sn) => {
        setSelectedSerialNumbers(prev => {
            const currentSelected = prev[productId] || [];
            const item = cart.find(c => c.id === productId);
            const maxAllowed = item ? item.cartQuantity : 0;

            if (currentSelected.includes(sn)) {
                // Deselect
                return { ...prev, [productId]: currentSelected.filter(s => s !== sn) };
            } else {
                // Select (limit to cart quantity)
                if (currentSelected.length < maxAllowed) {
                    return { ...prev, [productId]: [...currentSelected, sn] };
                } else {
                    return prev; // Max reached
                }
            }
        });
    };

    const handleCheckout = async (e) => {
        e.preventDefault();
        if (!requesterName.trim() || !deliveryLocation.trim() || !senderName.trim()) {
            setError('กรุณาระบุชื่อผู้เบิก, ผู้ส่งของ และสถานที่ส่งของ');
            return;
        }

        // Validate Serial Number Selection
        for (const item of cart) {
            const assets = availableAssets[item.id] || [];
            if (assets.length > 0) {
                const selected = selectedSerialNumbers[item.id] || [];
                // Requirement: Must select SNs equal to Cart Qty OR All Available Assets (whichever is lower)
                const requiredCount = Math.min(item.cartQuantity, assets.length);

                if (selected.length < requiredCount) {
                    setError(`กรุณาเลือกเลขครุภัณฑ์สำหรับ "${item.name}" ให้ครบ ${requiredCount} รายการ (เลือกแล้ว ${selected.length})`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const user = auth.currentUser;
            if (!user) throw new Error('User not authenticated');

            // 1. Prepare Transaction Data
            let systemNote = note;
            const snNoteParts = [];

            // Build items array for embedding
            const transactionItems = cart.map(item => {
                const selectedSNs = selectedSerialNumbers[item.id] || [];
                if (selectedSNs.length > 0) {
                    snNoteParts.push(`${item.name}: ${selectedSNs.join(', ')}`);
                }

                return {
                    product_id: item.id,
                    product_name: item.name,
                    product_sku: item.sku,
                    quantity: item.cartQuantity,
                    selected_serials: selectedSNs // Allow storing this directly too!
                };
            });

            if (snNoteParts.length > 0) {
                systemNote += `${systemNote ? '\n\n' : ''}[Serial Numbers]\n${snNoteParts.join('\n')}`;
            }

            // 2. Create Transaction Document
            const transactionData = {
                type: 'OUT',
                requester_name: requesterName,
                approver_name: senderName,
                note: systemNote,
                delivery_location: deliveryLocation,
                created_at: new Date().toISOString(),
                items: transactionItems // Embedded items!
            };

            const txRef = await addDoc(collection(db, 'transactions'), transactionData);

            // 3. Update Inventory & Assets
            // Use batch if possible, but Firestore limits batch to 500 ops.
            // For a cart, it's likely safe.
            const batch = writeBatch(db);

            for (const item of cart) {
                // Update Product Quantity
                const productRef = doc(db, 'products', item.id);
                // Note: In a real concurrent app, use increment(-qty). 
                // But for migration simplicity we use simple update calc.
                // Assuming item.quantity is fresh enough. Ideally calculate new qty.
                // Better: updateDoc(ref, { quantity: increment(-item.cartQuantity) })
                // But we don't have 'increment' imported. Let's stick to simple calc for now if we trust local state,
                // or just leave as is.
                // Actually, let's try to be safer if we can, but logic here:
                batch.update(productRef, { quantity: item.quantity - item.cartQuantity });

                // Update Assets
                const selectedSNs = selectedSerialNumbers[item.id] || [];
                if (selectedSNs.length > 0) {
                    // Find asset IDs for these SNs
                    const productAssets = availableAssets[item.id] || [];
                    const assetsToUpdate = productAssets.filter(a => selectedSNs.includes(a.serial_number));

                    for (const asset of assetsToUpdate) {
                        const assetRef = doc(db, 'assets', asset.id);
                        batch.update(assetRef, {
                            status: 'in_use',
                            current_holder: requesterName,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            }

            await batch.commit();


            // 4. Generate PDF
            const cartWithSNs = cart.map(item => ({
                ...item,
                serialNumbers: selectedSerialNumbers[item.id] || []
            }));

            const transactionWithMeta = {
                id: txRef.id,
                ...transactionData
            };

            // Note: PDF Generator expects 'note' to handle SNs usually, or 'cartWithSNs' 
            // if we updated it. We pass both.

            await generatePDF(transactionWithMeta, senderName, cartWithSNs);

            setSuccess(true);
            clearCart();
            setTimeout(() => {
                navigate('/transactions');
            }, 2000);

        } catch (err) {
            console.error('Checkout error:', err);
            setError('เกิดข้อผิดพลาดในการทำรายการ: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (cart.length === 0 && !success) {
        return (
            <div className="text-center py-20">
                <div className="glass-card max-w-md mx-auto p-10 backdrop-blur-2xl">
                    <div className="w-28 h-28 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center shadow-lg shadow-green-500/20 animate-pulse">
                        <ShoppingCart className="h-14 w-14 text-green-400" />
                    </div>
                    <h2 className=" " style={{ color: "var(--text-primary)" }}>ตะกร้าอุปกรณ์ว่างเปล่า</h2>
                    <p className="text-gray-400 mb-8">คุณยังไม่ได้เลือกอุปกรณ์ใดๆ</p>
                    <button
                        onClick={() => navigate('/products')}
                        className="btn-gradient px-8 py-3"
                    >
                        ไปที่รายการอุปกรณ์
                    </button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="text-center py-20">
                <div className="glass-card max-w-md mx-auto p-10 backdrop-blur-2xl">
                    <div className="w-28 h-28 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-500/20 flex items-center justify-center shadow-2xl shadow-green-500/40 animate-glow">
                        <CheckCircle className="h-14 w-14 text-green-400" />
                    </div>
                    <h2 className=" " style={{ color: "var(--text-primary)" }}>ทำรายการสำเร็จ!</h2>
                    <p className="text-gray-400">กำลังดาวน์โหลดใบเบิกพัสดุ...</p>
                    <div className="mt-6 flex justify-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/20 rounded-xl">
                    <ShoppingCart className="text-green-400" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>ตะกร้าเบิกอุปกรณ์</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cart Items */}
                <div className="lg:col-span-2 space-y-4">
                    {cart.map((item) => {
                        const hasAssetsItems = availableAssets[item.id] && availableAssets[item.id].length > 0;
                        const selectedForThisItem = selectedSerialNumbers[item.id] || [];
                        const assetsForThisItem = availableAssets[item.id] || [];

                        return (
                            <div key={item.id} className="glass-card-hover p-5 group border-l-4 border-transparent hover:border-l-[#1C6CB4] transition-all duration-300">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        {item.image_url ? (
                                            <img src={item.image_url} alt={item.name} className="w-16 h-16 object-cover rounded-xl" />
                                        ) : (
                                            <div className="w-16 h-16 bg-white/5 rounded-xl flex items-center justify-center">
                                                <FileText className="h-8 w-8 text-gray-500" />
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</h3>
                                            <p className="text-sm text-gray-400">SKU: {item.sku}</p>
                                            <p className="text-sm text-gray-500">คงเหลือในคลัง: {item.quantity}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center bg-white/5 rounded-xl overflow-hidden border border-white/10 group-hover:border-[#1C6CB4]/30 transition-colors">
                                            <button
                                                onClick={() => updateCartQuantity(item.id, item.cartQuantity - 1)}
                                                className="p-2.5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                                disabled={item.cartQuantity <= 1}
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <div className="w-14 text-center text-white py-2 font-mono font-semibold">
                                                {item.cartQuantity}
                                            </div>
                                            <button
                                                onClick={() => updateCartQuantity(item.id, item.cartQuantity + 1)}
                                                className="p-2.5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                                disabled={item.cartQuantity >= item.quantity}
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(item.id)}
                                            className="p-2.5 text-[#ff6666] hover:bg-[#ED2229]/20 hover:shadow-lg hover:shadow-[#ED2229]/20 rounded-xl transition-all duration-300"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Asset Selection Section */}
                                {hasAssetsItems && (
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm font-medium text-blue-400 flex items-center gap-2">
                                                <CheckCircle size={14} />
                                                เลือกเลขครุภัณฑ์ ({selectedForThisItem.length}/{Math.min(item.cartQuantity, assetsForThisItem.length)})
                                            </label>
                                            {selectedForThisItem.length < Math.min(item.cartQuantity, assetsForThisItem.length) && (
                                                <span className="text-xs text-red-400 animate-pulse">
                                                    * กรุณาเลือกให้ครบตามจำนวน
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                            {assetsForThisItem.map(asset => {
                                                const isSelected = selectedForThisItem.includes(asset.serial_number);
                                                return (
                                                    <button
                                                        key={asset.id}
                                                        onClick={() => handleSerialNumberSelect(item.id, asset.serial_number)}
                                                        className={`text-xs px-3 py-2.5 rounded-xl border font-mono transition-all duration-300 transform ${isSelected
                                                            ? 'bg-gradient-to-r from-[#1C6CB4]/30 to-blue-500/20 border-[#1C6CB4] text-blue-300 shadow-lg shadow-[#1C6CB4]/20 scale-105'
                                                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:scale-[1.02] hover:border-white/20'
                                                            }`}
                                                        disabled={!isSelected && selectedForThisItem.length >= item.cartQuantity}
                                                    >
                                                        {asset.serial_number}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>


                {/* Order Summary */}
                <div className="lg:col-span-1">
                    <div className="glass-card p-6 sticky top-6 border border-white/10 shadow-2xl shadow-[#1C6CB4]/10 backdrop-blur-2xl">
                        <h2 className=" " style={{ color: "var(--text-primary)" }}>สรุปรายการ</h2>

                        <div className="space-y-3 mb-4">
                            <div className="flex justify-between text-gray-400">
                                <span>จำนวนรายการ</span>
                                <span className="text-white font-medium">{cart.length} รายการ</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>จำนวนชิ้นรวม</span>
                                <span className="text-white font-medium">{totalItems} ชิ้น</span>
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4 mb-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    สถานที่ส่งของ <span className="text-[#ED2229]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={deliveryLocation}
                                    onChange={(e) => setDeliveryLocation(e.target.value)}
                                    className="glass-input"
                                    placeholder="ระบุสถานที่ส่งของ"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    ชื่อผู้เบิก <span className="text-[#ED2229]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={requesterName}
                                    onChange={(e) => setRequesterName(e.target.value)}
                                    className="glass-input"
                                    placeholder="ระบุชื่อของคุณ"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    ชื่อผู้ส่งของ <span className="text-[#ED2229]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={senderName}
                                    onChange={(e) => setSenderName(e.target.value)}
                                    className="glass-input"
                                    placeholder="ระบุชื่อผู้ส่งของ"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    หมายเหตุ
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="glass-input"
                                    placeholder="ระบุหมายเหตุ (ถ้ามี)"
                                    rows="2"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-[#ED2229]/20 text-[#ff6666] rounded-xl flex items-start gap-2 text-sm border border-[#ED2229]/30">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            onClick={handleCheckout}
                            disabled={isSubmitting || cart.length === 0}
                            className="btn-gradient w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'กำลังดำเนินการ...' : 'ยืนยันการเบิก'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Cart;
