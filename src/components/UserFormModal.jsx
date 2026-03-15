import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Mail, User, Shield, Building, Phone, AlertCircle } from 'lucide-react';

const UserFormModal = ({ isOpen, onClose, onSave, user }) => {
    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        role: 'staff',
        department: '',
        phone: ''
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Load user data when editing
    useEffect(() => {
        if (user) {
            setFormData({
                email: user.email || '',
                full_name: user.full_name || '',
                role: user.role || 'staff',
                department: user.department || '',
                phone: user.phone || ''
            });
        } else {
            setFormData({
                email: '',
                full_name: '',
                role: 'staff',
                department: '',
                phone: ''
            });
        }
        setError(null);
    }, [user, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.email) {
            setError('กรุณากรอกอีเมล');
            return;
        }

        if (!formData.full_name) {
            setError('กรุณากรอกชื่อ-นามสกุล');
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

    const roles = [
        { value: 'admin', label: 'Admin', desc: 'จัดการระบบทั้งหมด', color: 'purple' },
        { value: 'staff', label: 'Staff', desc: 'เบิกจ่าย รับคืน สแกน', color: 'blue' },
        { value: 'viewer', label: 'Viewer', desc: 'ดูข้อมูลเท่านั้น', color: 'gray' }
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            {/* Modal - Light Theme */}
            <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <User className="text-purple-500" size={20} />
                        </div>
                        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
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
                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    {/* Email */}
                    <div className="group">
                        <label className="form-label group-focus-within:text-[#1C6CB4] transition-colors">
                            อีเมล <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1C6CB4] transition-colors" size={18} />
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="user@example.com"
                                required
                                disabled={!!user}
                            />
                        </div>
                        {!user && (
                            <p className="text-xs text-gray-500 mt-1">
                                ระบบจะส่ง invite email ไปยังอีเมลนี้
                            </p>
                        )}
                    </div>

                    {/* Full Name */}
                    <div className="group">
                        <label className="form-label group-focus-within:text-[#1C6CB4] transition-colors">
                            ชื่อ-นามสกุล <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1C6CB4] transition-colors" size={18} />
                            <input
                                type="text"
                                value={formData.full_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="กรอกชื่อ-นามสกุล"
                                required
                            />
                        </div>
                    </div>

                    {/* Role */}
                    <div>
                        <label className="form-label flex items-center gap-1">
                            <Shield size={14} />
                            บทบาท <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {roles.map(role => (
                                <button
                                    type="button"
                                    key={role.value}
                                    onClick={() => setFormData(prev => ({ ...prev, role: role.value }))}
                                    className={`p-3 rounded-xl border text-center transition-all ${formData.role === role.value
                                            ? role.color === 'purple'
                                                ? 'bg-purple-50 border-purple-300 text-purple-600'
                                                : role.color === 'blue'
                                                    ? 'bg-blue-50 border-blue-300 text-blue-600'
                                                    : 'bg-gray-100 border-gray-300 text-gray-600'
                                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    style={{ borderColor: formData.role === role.value ? undefined : 'var(--border-color)' }}
                                >
                                    <span className="font-medium block">{role.label}</span>
                                    <span className="text-xs opacity-70 block mt-1">{role.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Department */}
                    <div className="group">
                        <label className="form-label group-focus-within:text-[#1C6CB4] transition-colors">
                            แผนก
                        </label>
                        <div className="relative">
                            <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1C6CB4] transition-colors" size={18} />
                            <input
                                type="text"
                                value={formData.department}
                                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="เช่น IT, HR, การเงิน"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="group">
                        <label className="form-label group-focus-within:text-[#1C6CB4] transition-colors">
                            เบอร์โทร
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#1C6CB4] transition-colors" size={18} />
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                className="glass-input pl-12 w-full"
                                placeholder="เช่น 081-234-5678"
                            />
                        </div>
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
                                    {user ? 'บันทึก' : 'เพิ่มผู้ใช้'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserFormModal;
