import React, { useState } from 'react';
import { auth } from '../lib/firebase'; // Ensure auth is exported from firebase.js
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Settings as SettingsIcon, Bell, Lock, Save, Loader2, Check, X, Volume2 } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

const Settings = () => {
    const [message, setMessage] = useState(null);

    // Use notifications hook
    const {
        pushPermission,
        requestPushPermission,
        showPushNotification
    } = useNotifications();

    // Settings state
    const [notifications, setNotifications] = useState({
        lowStock: true,
        newTransaction: true,
        systemUpdates: false
    });

    // Password change
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState(''); // Need current password for re-auth if needed
    const [changingPassword, setChangingPassword] = useState(false);

    const handlePasswordChange = async (e) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'รหัสผ่านใหม่ไม่ตรงกัน' });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
            return;
        }

        setChangingPassword(true);
        setMessage(null);

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No user logged in");

            await updatePassword(user, newPassword);

            setMessage({ type: 'success', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
            setShowPasswordForm(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error('Error changing password:', err);
            if (err.code === 'auth/requires-recent-login') {
                setMessage({ type: 'error', text: 'กรุณาออกจากระบบและเข้าสู่ระบบใหม่ก่อนเปลี่ยนรหัสผ่าน' });
            } else {
                setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + err.message });
            }
        } finally {
            setChangingPassword(false);
        }
    };

    const ToggleSwitch = ({ enabled, onChange }) => (
        <button
            type="button"
            onClick={() => onChange(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${enabled ? 'bg-[#1C6CB4]' : 'bg-white/20'
                }`}
        >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${enabled ? 'translate-x-7' : 'translate-x-1'
                }`} />
        </button>
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/20 rounded-xl">
                    <SettingsIcon className="text-purple-400" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>ตั้งค่า</h1>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-xl flex items-center gap-2 ${message.type === 'success'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                    {message.type === 'success' ? <Check size={18} /> : <X size={18} />}
                    {message.text}
                </div>
            )}

            {/* Notification Settings */}
            <div className="glass-premium p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#1C6CB4]/20 rounded-lg">
                        <Bell className="text-[#5ca0dc]" size={20} />
                    </div>
                    <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>การแจ้งเตือน</h3>
                </div>

                <div className="space-y-4">
                    {/* NOTE: These toggles currently only affect local state, not saved to DB in this refactor version. 
                         If per-user preferences are needed, we need a 'user_settings' collection. 
                         For migration parity, keeping UI but they might reset on reload unless we save them. 
                         Original code didn't seem to persist them to DB either in the snippet shown, just useState.
                      */}
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                        <div>
                            <p className="font-medium" style={{ color: "var(--text-primary)" }}>สินค้าใกล้หมด</p>
                            <p className="text-sm text-gray-400">แจ้งเตือนเมื่อสินค้าถึงจุดสั่งซื้อใหม่</p>
                        </div>
                        <ToggleSwitch
                            enabled={notifications.lowStock}
                            onChange={(val) => setNotifications(prev => ({ ...prev, lowStock: val }))}
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                        <div>
                            <p className="font-medium" style={{ color: "var(--text-primary)" }}>การเบิกจ่ายใหม่</p>
                            <p className="text-sm text-gray-400">แจ้งเตือนเมื่อมีการเบิกจ่ายสำเร็จ</p>
                        </div>
                        <ToggleSwitch
                            enabled={notifications.newTransaction}
                            onChange={(val) => setNotifications(prev => ({ ...prev, newTransaction: val }))}
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                        <div>
                            <p className="font-medium" style={{ color: "var(--text-primary)" }}>อัปเดตระบบ</p>
                            <p className="text-sm text-gray-400">แจ้งเตือนเมื่อมีการอัปเดตระบบใหม่</p>
                        </div>
                        <ToggleSwitch
                            enabled={notifications.systemUpdates}
                            onChange={(val) => setNotifications(prev => ({ ...prev, systemUpdates: val }))}
                        />
                    </div>

                    {/* Push Notification Permission */}
                    <div className="pt-4 border-t border-white/10">
                        <h4 className="text-sm font-medium text-gray-400 mb-3">Push Notification (แจ้งเตือนบน Browser)</h4>

                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                            <div className="flex-1">
                                <p className="font-medium" style={{ color: "var(--text-primary)" }}>เปิดใช้งาน Push Notification</p>
                                <p className="text-sm text-gray-400">
                                    {pushPermission === 'granted' && 'เปิดใช้งานแล้ว ✅'}
                                    {pushPermission === 'denied' && 'ถูกปิดกั้น - กรุณาเปิดใน Browser Settings'}
                                    {pushPermission === 'default' && 'กดปุ่มเพื่อเปิดใช้งาน'}
                                    {pushPermission === 'unsupported' && 'Browser ไม่รองรับ'}
                                </p>
                            </div>
                            {pushPermission !== 'granted' && pushPermission !== 'denied' && (
                                <button
                                    onClick={async () => {
                                        const result = await requestPushPermission();
                                        if (result === 'granted') {
                                            setMessage({ type: 'success', text: 'เปิดใช้งาน Push Notification สำเร็จ!' });
                                        } else if (result === 'denied') {
                                            setMessage({ type: 'error', text: 'คุณปฏิเสธการแจ้งเตือน' });
                                        }
                                    }}
                                    className="px-4 py-2 bg-[#1C6CB4] text-white rounded-lg text-sm hover:bg-[#1C6CB4]/80 transition-colors"
                                >
                                    เปิดใช้งาน
                                </button>
                            )}
                            {pushPermission === 'granted' && (
                                <span className="text-green-400 font-medium">เปิดอยู่</span>
                            )}
                        </div>

                        {/* Test Push Notification */}
                        {pushPermission === 'granted' && (
                            <div className="mt-3 flex items-center justify-between p-4 bg-[#1C6CB4]/10 rounded-xl border border-[#1C6CB4]/20">
                                <div className="flex items-center gap-3">
                                    <Volume2 className="text-[#5ca0dc]" size={20} />
                                    <div>
                                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>ทดสอบการแจ้งเตือน</p>
                                        <p className="text-sm text-gray-400">ส่ง Push Notification ทดสอบ</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        showPushNotification(
                                            'ทดสอบ StockFlow 🔔',
                                            'การแจ้งเตือนทำงานปกติ!'
                                        );
                                        setMessage({ type: 'success', text: 'ส่งการแจ้งเตือนทดสอบแล้ว!' });
                                    }}
                                    className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition-colors"
                                >
                                    ส่งทดสอบ
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Security Settings */}
            <div className="glass-premium p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-500/20 rounded-lg">
                        <Lock className="text-red-400" size={20} />
                    </div>
                    <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>ความปลอดภัย</h3>
                </div>

                {!showPasswordForm ? (
                    <button
                        onClick={() => setShowPasswordForm(true)}
                        className="w-full flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Lock className="text-gray-400" size={18} />
                            <span className="text-white">เปลี่ยนรหัสผ่าน</span>
                        </div>
                        <span className="text-gray-400">→</span>
                    </button>
                ) : (
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">รหัสผ่านใหม่</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="glass-input"
                                placeholder="กรอกรหัสผ่านใหม่"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">ยืนยันรหัสผ่านใหม่</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="glass-input"
                                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                                required
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowPasswordForm(false)}
                                className="flex-1 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="submit"
                                disabled={changingPassword}
                                className="flex-1 btn-gradient flex items-center justify-center gap-2"
                            >
                                {changingPassword ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                {changingPassword ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Settings;
