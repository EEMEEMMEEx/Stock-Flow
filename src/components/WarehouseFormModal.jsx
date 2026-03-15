import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Warehouse, MapPin, Phone, User, Hash, ToggleLeft, ToggleRight } from 'lucide-react';

const WarehouseFormModal = ({ isOpen, onClose, onSave, warehouse }) => {
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        manager_name: '',
        is_active: true
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (warehouse) {
            setFormData({
                name: warehouse.name || '',
                code: warehouse.code || '',
                address: warehouse.address || '',
                phone: warehouse.phone || '',
                manager_name: warehouse.manager_name || '',
                is_active: warehouse.is_active !== false
            });
        } else {
            setFormData({
                name: '',
                code: '',
                address: '',
                phone: '',
                manager_name: '',
                is_active: true
            });
        }
        setError(null);
    }, [warehouse, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.name.trim()) {
            setError('กรุณากรอกชื่อคลัง');
            return;
        }
        if (!formData.code.trim()) {
            setError('กรุณากรอกรหัสคลัง');
            return;
        }

        setSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <Warehouse className="text-indigo-600" size={20} />
                        </div>
                        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {warehouse ? 'แก้ไขคลัง' : 'เพิ่มคลังใหม่'}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div className="group">
                        <label className="form-label">ชื่อคลัง <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <Warehouse className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="เช่น คลังหลัก, สาขาเชียงใหม่"
                                required
                            />
                        </div>
                    </div>

                    {/* Code */}
                    <div className="group">
                        <label className="form-label">รหัสคลัง <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={formData.code}
                                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                className="glass-input pl-12 w-full uppercase"
                                placeholder="เช่น MAIN, CNX, HKT"
                                maxLength={10}
                                required
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">รหัสสั้นๆ สำหรับระบุคลัง</p>
                    </div>

                    {/* Address */}
                    <div className="group">
                        <label className="form-label">ที่อยู่</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="ที่อยู่คลัง/สาขา"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="group">
                        <label className="form-label">เบอร์โทร</label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="เช่น 02-123-4567"
                            />
                        </div>
                    </div>

                    {/* Manager */}
                    <div className="group">
                        <label className="form-label">ผู้จัดการคลัง</label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={formData.manager_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, manager_name: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="ชื่อผู้จัดการ"
                            />
                        </div>
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>สถานะคลัง</p>
                            <p className="text-sm text-gray-500">
                                {formData.is_active ? 'เปิดใช้งาน - สามารถเบิก/โอนได้' : 'ปิดใช้งาน - ไม่สามารถเบิก/โอนได้'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                            className={`p-2 rounded-lg transition-colors ${formData.is_active
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-gray-200 text-gray-400'
                                }`}
                        >
                            {formData.is_active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 btn-gradient flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    กำลังบันทึก...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    {warehouse ? 'บันทึก' : 'เพิ่มคลัง'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WarehouseFormModal;
