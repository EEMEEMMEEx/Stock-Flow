import React from 'react';
import { X, MapPin, Tag, AlertCircle, Package, ShoppingCart } from 'lucide-react';
import { useStore } from '../store/useStore';

const ProductDetailsModal = ({ product, onClose, onAddToCart }) => {
    const { user } = useStore();
    const canOperate = user?.role === 'admin' || user?.role === 'staff';

    if (!product) return null;

    const getStockColor = () => {
        if (product.quantity === 0) return 'text-red-400';
        if (product.quantity <= product.min_threshold) return 'text-yellow-400';
        return 'text-green-400';
    };

    const getStockBgColor = () => {
        if (product.quantity === 0) return 'bg-red-500/20';
        if (product.quantity <= product.min_threshold) return 'bg-yellow-500/20';
        return 'bg-green-500/20';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-all duration-300">
            <div className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                {/* Image Header */}
                <div className="relative h-56 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                        <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="text-center">
                            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <Package size={40} className="text-gray-500" />
                            </div>
                            <span className="text-gray-500 text-sm">ไม่มีรูปภาพ</span>
                        </div>
                    )}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent"></div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-colors"
                    >
                        <X size={20} />
                    </button>

                    {/* Category & Type Badges */}
                    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#5ca0dc] bg-[#1C6CB4]/30 backdrop-blur-sm rounded-full border border-[#1C6CB4]/30">
                            <Tag size={14} />
                            {product.category}
                        </span>
                        {product.type && product.type !== product.category && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-400 bg-purple-600/30 backdrop-blur-sm rounded-full border border-purple-600/30">
                                <Package size={14} />
                                {product.type}
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Title & SKU */}
                    <div>
                        <p className="text-sm text-gray-400 mb-1 font-mono">รหัส: {product.sku}</p>
                        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {product.name}
                        </h2>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                            <MapPin size={18} className="text-[#5ca0dc]" />
                            <div>
                                <p className="text-xs text-gray-500">สถานที่เก็บ</p>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.location || 'ไม่ระบุ'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                            <AlertCircle size={18} className="text-yellow-400" />
                            <div>
                                <p className="text-xs text-gray-500">แจ้งเตือนเมื่อต่ำกว่า</p>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.min_threshold} ชิ้น</p>
                            </div>
                        </div>
                    </div>

                    {/* Note */}
                    {product.note && (
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                            <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                                <AlertCircle size={14} />
                                หมายเหตุ
                            </h3>
                            <p className="text-sm text-gray-400 whitespace-pre-wrap">
                                {product.note}
                            </p>
                        </div>
                    )}

                    {/* Stock & Action */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <div className={`p-3 rounded-xl ${getStockBgColor()}`}>
                            <p className="text-xs text-gray-400 mb-0.5">คงเหลือ</p>
                            <p className={`text-3xl font-bold ${getStockColor()}`}>
                                {product.quantity}
                                <span className="text-sm font-normal text-gray-500 ml-1">ชิ้น</span>
                            </p>
                        </div>
                        {canOperate && (
                            <button
                                onClick={() => {
                                    onAddToCart(product);
                                    onClose();
                                }}
                                disabled={product.quantity === 0}
                                className="btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                <ShoppingCart size={18} className="group-hover:scale-110 transition-transform" />
                                <span>เพิ่มลงตะกร้า</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetailsModal;
