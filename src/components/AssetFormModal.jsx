import React, { useState, useEffect } from 'react';
import { X, Save, Loader } from 'lucide-react';


const AssetFormModal = ({ isOpen, onClose, onSave, asset = null, products = [] }) => {
    const [formData, setFormData] = useState({
        serial_number: '',
        product_id: '',
        status: 'in_stock',
        current_holder: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (asset) {
            setFormData({
                serial_number: asset.serial_number || '',
                product_id: asset.product_id || '',
                status: asset.status || 'in_stock',
                current_holder: asset.current_holder || ''
            });
        } else {
            setFormData({
                serial_number: '',
                product_id: products.length > 0 ? products[0].id : '',
                status: 'in_stock',
                current_holder: ''
            });
        }
    }, [asset, isOpen, products]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Error saving asset:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            <div className="glass-card w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
                <div className="p-6 border-b flex justify-between items-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {asset ? 'แก้ไขครุภัณฑ์' : 'เพิ่มครุภัณฑ์ใหม่'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                Serial Number <span className="text-[#ED2229]">*</span>
                            </label>
                            <input
                                type="text"
                                name="serial_number"
                                required
                                value={formData.serial_number}
                                onChange={handleChange}
                                placeholder="ระบุหมายเลขครุภัณฑ์"
                                className="glass-input"
                            />
                        </div>

                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                อุปกรณ์ (Product) <span className="text-[#ED2229]">*</span>
                            </label>
                            <div className="relative">
                                <select
                                    name="product_id"
                                    required
                                    value={formData.product_id}
                                    onChange={handleChange}
                                    className="glass-select appearance-none cursor-pointer"
                                >
                                    <option value="" className="bg-slate-900 text-gray-400">เลือกอุปกรณ์</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                            {p.name} ({p.sku})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                สถานะ
                            </label>
                            <div className="relative">
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    className="glass-select appearance-none cursor-pointer"
                                >
                                    <option value="in_stock" className="bg-slate-900 text-green-400">พร้อมใช้งาน (In Stock)</option>
                                    <option value="in_use" className="bg-slate-900 text-blue-400">ถูกใช้งาน (In Use)</option>
                                    <option value="maintenance" className="bg-slate-900 text-yellow-400">ส่งซ่อม (Maintenance)</option>
                                    <option value="retired" className="bg-slate-900 text-red-400">จำหน่ายออก (Retired)</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        {formData.status !== 'in_stock' && (
                            <div className="group animate-in slide-in-from-top-2 duration-200">
                                <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                    ผู้ถือครองปัจจุบัน <span className="text-[#ED2229]">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="current_holder"
                                    required
                                    value={formData.current_holder}
                                    onChange={handleChange}
                                    placeholder="ระบุชื่อผู้ถือครอง"
                                    className="glass-input"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {saving ? <Loader className="animate-spin" size={18} /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
                            <span>บันทึกข้อมูล</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AssetFormModal;
