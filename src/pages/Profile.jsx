import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User, Mail, Phone, MapPin, Calendar, Save, Camera, Shield, Activity, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const Profile = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Avatar state
    const [avatarUrl, setAvatarUrl] = useState(null);
    const fileInputRef = useRef(null);

    // Form state
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [department, setDepartment] = useState('');

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setFullName(currentUser.displayName || '');
                setAvatarUrl(currentUser.photoURL || null);

                // Fetch additional data from Firestore
                try {
                    const docRef = doc(db, "users", currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setPhone(data.phone || '');
                        setDepartment(data.department || '');
                        // Fallback if not in Auth profile
                        if (!currentUser.displayName && data.full_name) setFullName(data.full_name);
                        if (!currentUser.photoURL && data.avatar_url) setAvatarUrl(data.avatar_url);
                    }
                } catch (err) {
                    console.error("Error fetching user data from Firestore:", err);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'กรุณาเลือกไฟล์รูปภาพเท่านั้น' });
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'ขนาดไฟล์ต้องไม่เกิน 2MB' });
            return;
        }

        setUploadingAvatar(true);
        setMessage(null);

        try {
            if (!user) throw new Error("not logged in");

            const formDataUpload = new FormData();
            formDataUpload.append('file', file);
            formDataUpload.append('upload_preset', 'gfonscq5');
            formDataUpload.append('folder', `avatars/${user.uid}`); // Optional folder structure

            const response = await fetch('https://api.cloudinary.com/v1_1/dmurdpztl/image/upload', {
                method: 'POST',
                body: formDataUpload
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Upload failed');
            }

            const data = await response.json();
            const publicUrl = data.secure_url;

            // Update Auth Profile
            await updateProfile(user, { photoURL: publicUrl });

            // Update Firestore
            const docRef = doc(db, "users", user.uid);
            await setDoc(docRef, { avatar_url: publicUrl }, { merge: true });

            setAvatarUrl(publicUrl);
            setMessage({ type: 'success', text: 'อัปโหลดรูปโปรไฟล์เรียบร้อยแล้ว' });
        } catch (err) {
            console.error('Error uploading avatar:', err);
            setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + err.message });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            if (!user) throw new Error("not logged in");

            // Update Auth Profile
            if (user.displayName !== fullName) {
                await updateProfile(user, { displayName: fullName });
            }

            // Update Firestore for extra fields
            const docRef = doc(db, "users", user.uid);
            await setDoc(docRef, {
                full_name: fullName,
                phone: phone,
                department: department,
                email: user.email, // Keep email in sync just in case
                updated_at: new Date().toISOString()
            }, { merge: true });

            setMessage({ type: 'success', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
        } catch (err) {
            console.error('Error updating profile:', err);
            setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด: ' + err.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="glass-premium p-8 text-center scale-in">
                    <Loader2 className="animate-spin text-[#1C6CB4] mx-auto mb-4" size={40} />
                    <p className="text-gray-400">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                className="hidden"
            />

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-[#1C6CB4]/20 rounded-xl">
                    <User className="text-[#5ca0dc]" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>โปรไฟล์</h1>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-xl flex items-center gap-2 ${message.type === 'success'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="glass-premium p-6 text-center">
                    <div className="relative inline-block mb-4">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar"
                                className="w-24 h-24 rounded-2xl object-cover shadow-lg shadow-[#1C6CB4]/30"
                            />
                        ) : (
                            <div className="w-24 h-24 bg-gradient-to-br from-[#1C6CB4] to-[#5ca0dc] rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-[#1C6CB4]/30">
                                {fullName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                        )}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="absolute -bottom-2 -right-2 w-8 h-8 bg-[#1C6CB4] rounded-lg flex items-center justify-center text-white hover:bg-[#1C6CB4]/80 transition-colors disabled:opacity-50"
                        >
                            {uploadingAvatar ? (
                                <Loader2 className="animate-spin" size={16} />
                            ) : (
                                <Camera size={16} />
                            )}
                        </button>
                    </div>
                    <h2 className=" " style={{ color: "var(--text-primary)" }}>{fullName || 'ผู้ใช้งาน'}</h2>
                    <p className="text-gray-400 text-sm mb-4">{user?.email}</p>

                    <div className="pt-4 border-t border-white/10 space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                            <Shield className="text-green-400" size={16} />
                            <span className="text-gray-400">บัญชียืนยันแล้ว</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <Activity className="text-[#5ca0dc]" size={16} />
                            <span className="text-gray-400">ใช้งานล่าสุด: วันนี้</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <Calendar className="text-purple-400" size={16} />
                            <span className="text-gray-400">
                                สมาชิกตั้งแต่: {user?.metadata?.creationTime ? format(new Date(user.metadata.creationTime), 'dd MMM yyyy', { locale: th }) : '-'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Edit Form */}
                <div className="lg:col-span-2 glass-premium p-6">
                    <h3 className=" " style={{ color: "var(--text-primary)" }}>แก้ไขข้อมูลส่วนตัว</h3>

                    <form onSubmit={handleSave} className="space-y-5">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                <User className="inline mr-2" size={14} />
                                ชื่อ-นามสกุล
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="glass-input"
                                placeholder="กรอกชื่อ-นามสกุล"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                <Mail className="inline mr-2" size={14} />
                                อีเมล
                            </label>
                            <input
                                type="email"
                                value={user?.email || ''}
                                disabled
                                className="glass-input opacity-60"
                            />
                            <p className="text-xs text-gray-500 mt-1">ไม่สามารถเปลี่ยนอีเมลได้</p>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                <Phone className="inline mr-2" size={14} />
                                เบอร์โทรศัพท์
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="glass-input"
                                placeholder="กรอกเบอร์โทรศัพท์"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                <MapPin className="inline mr-2" size={14} />
                                แผนก/หน่วยงาน
                            </label>
                            <input
                                type="text"
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="glass-input"
                                placeholder="กรอกชื่อแผนก/หน่วยงาน"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-gradient btn-glow flex items-center gap-2 w-full justify-center"
                        >
                            {saving ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <Save size={18} />
                            )}
                            {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Profile;
