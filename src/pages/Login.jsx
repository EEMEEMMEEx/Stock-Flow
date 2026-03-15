import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, UserPlus, LogIn, KeyRound, ArrowLeft, Eye, EyeOff, Sparkles } from 'lucide-react';
import emailjs from '@emailjs/browser';

// EmailJS Configuration - REPLACE WITH YOUR KEYS
// สมัครฟรีที่ https://www.emailjs.com/
// 1. Create Account
// 2. Add Service (e.g., Gmail)
// 3. Add Template ("New User Registration")
const EMAILJS_SERVICE_ID = "service_hisc5rk";
const EMAILJS_TEMPLATE_ID = "template_hc9gwct";
const EMAILJS_PUBLIC_KEY = "YUZNQQ_r1LkcioKIM"; // นำ Public Key มาใส่ตรงนี้ (ดูวิธีหาด้านล่าง)

const ADMIN_EMAIL = "saweksoot@gmail.com"; // อีเมลแอดมินที่ต้องการให้แจ้งเตือน

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const navigate = useNavigate();

    // Helper function to translate Firebase error messages to Thai
    const translateError = (code) => {
        const errorMap = {
            'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
            'auth/user-not-found': 'ไม่พบผู้ใช้นี้ในระบบ',
            'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
            'auth/email-already-in-use': 'อีเมลนี้ถูกใช้งานแล้ว',
            'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
            'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
            'auth/too-many-requests': 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่',
        };
        return errorMap[code] || 'เกิดข้อผิดพลาด: ' + code;
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isForgotPassword) {
                await sendPasswordResetEmail(auth, email);
                setMessage('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว');
            } else if (isSignUp) {
                // Validate confirm password
                if (password !== confirmPassword) {
                    setError('รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่อีกครั้ง');
                    setLoading(false);
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update profile with full name
                if (fullName) {
                    await updateProfile(user, {
                        displayName: fullName
                    });
                    await updateProfile(user, {
                        displayName: fullName
                    });
                }

                // Create user document in Firestore with pending status
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    email: user.email,
                    full_name: fullName,
                    role: 'viewer', // Default safe role
                    status: 'pending', // Pending approval
                    created_at: serverTimestamp(),
                    last_sign_in: serverTimestamp()
                });

                // Send email to Admin
                try {
                    console.log("Sending email to admin:", ADMIN_EMAIL);
                    // Prepare template params matching your EmailJS template
                    const templateParams = {
                        to_email: ADMIN_EMAIL,
                        to_name: "Admin",
                        from_name: "FORTH StockFlow System",
                        message: `มีผู้ใช้ใหม่ลงทะเบียน:\nชื่อ: ${fullName}\nอีเมล: ${email}\nสถานะ: รอการอนุมัติ\n\nกรุณาตรวจสอบที่: https://forth-inventory-system.netlify.app/users`,
                        new_user_name: fullName,
                        new_user_email: email
                    };

                    await emailjs.send(
                        EMAILJS_SERVICE_ID,
                        EMAILJS_TEMPLATE_ID,
                        templateParams,
                        EMAILJS_PUBLIC_KEY
                    );
                    console.log("Email sent successfully!");
                } catch (emailErr) {
                    console.error("Failed to send email notif:", emailErr);
                    // DEBUG: Show alert to user to debug the issue
                    alert(`Email sending failed: ${JSON.stringify(emailErr)}`);
                }

                setMessage('ลงทะเบียนสำเร็จ! คุณสามารถเข้าสู่ระบบได้แล้ว');
                // Firebase automatically signs in after signup, so we might want to navigate
                // But keeping the logic similar to existing flow:
                setMessage('ลงทะเบียนสำเร็จ! กรุณารอการอนุมัติ');
                // Navigate to pending page instead of dashboard
                navigate('/pending');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                navigate('/');
            }
        } catch (err) {
            console.error(err);
            setError(translateError(err.code || err.message));
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = (mode) => {
        setError(null);
        setMessage(null);
        if (mode === 'forgot') {
            setIsForgotPassword(true);
            setIsSignUp(false);
        } else if (mode === 'signup') {
            setIsSignUp(true);
            setIsForgotPassword(false);
        } else {
            setIsSignUp(false);
            setIsForgotPassword(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
            {/* Animated Background Elements - Light Theme */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#1C6CB4]/10 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#ED2229]/10 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#1C6CB4]/5 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            {/* Login Card */}
            <div className="relative max-w-md w-full">
                {/* Light Glassmorphism Card */}
                <div className="backdrop-blur-xl bg-white/80 rounded-3xl shadow-2xl shadow-slate-200/50 p-8 border border-slate-200/50 transition-all duration-500 hover:shadow-[#1C6CB4]/10 hover:shadow-3xl">
                    {/* Header with Logo */}
                    <div className="text-center mb-8">
                        {/* Animated Logo */}
                        <div className="relative inline-block mb-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-[#1C6CB4] via-[#2a7dc4] to-[#ED2229] rounded-2xl flex items-center justify-center shadow-lg shadow-[#1C6CB4]/30 transform transition-transform duration-300 hover:scale-105 hover:rotate-3">
                                <img
                                    src="/logo.png"
                                    alt="FORTH StockFlow"
                                    className="w-14 h-14 object-contain"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <span className="font-bold text-2xl text-white hidden items-center justify-center">FS</span>
                            </div>
                            <div className="absolute -top-1 -right-1">
                                <Sparkles className="w-5 h-5 text-[#ED2229] animate-pulse" />
                            </div>
                        </div>

                        <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
                            {isForgotPassword ? 'ลืมรหัสผ่าน' : isSignUp ? 'สร้างบัญชีใหม่' : 'ยินดีต้อนรับ'}
                        </h1>
                        <p className="text-slate-500 text-sm">
                            {isForgotPassword
                                ? 'กรอกอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน'
                                : isSignUp
                                    ? 'สมัครสมาชิก FORTH StockFlow'
                                    : 'เข้าสู่ระบบ FORTH StockFlow'}
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200 flex items-center gap-2 animate-shake">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            {error}
                        </div>
                    )}

                    {/* Success Message */}
                    {message && (
                        <div className="mb-4 p-4 bg-green-50 text-green-600 text-sm rounded-xl border border-green-200 flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            {message}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleAuth} className="space-y-5">
                        {/* Full Name - Sign Up Only */}
                        {isSignUp && (
                            <div className="group">
                                <label className="block text-sm font-medium text-slate-600 mb-2">
                                    ชื่อ-นามสกุล
                                </label>
                                <div className="relative">
                                    <UserPlus className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-[#1C6CB4] transition-colors" size={20} />
                                    <input
                                        type="text"
                                        required={isSignUp}
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        disabled={loading}
                                        className="pl-12 pr-4 py-3 w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#1C6CB4] focus:border-transparent focus:bg-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder="สมชาย ใจดี"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Email */}
                        <div className="group">
                            <label className="block text-sm font-medium text-slate-600 mb-2">
                                อีเมล
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-[#1C6CB4] transition-colors" size={20} />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    className="pl-12 pr-4 py-3 w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#1C6CB4] focus:border-transparent focus:bg-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        {!isForgotPassword && (
                            <div className="group">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-slate-600">
                                        รหัสผ่าน
                                    </label>
                                    {!isSignUp && (
                                        <button
                                            type="button"
                                            onClick={() => toggleMode('forgot')}
                                            className="text-sm text-[#1C6CB4] hover:text-[#2a7dc4] font-medium transition-colors"
                                        >
                                            ลืมรหัสผ่าน?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-[#1C6CB4] transition-colors" size={20} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={loading}
                                        className="pl-12 pr-12 py-3 w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#1C6CB4] focus:border-transparent focus:bg-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder="••••••••"
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Confirm Password - Sign Up Only */}
                        {isSignUp && (
                            <div className="group">
                                <label className="block text-sm font-medium text-slate-600 mb-2">
                                    ยืนยันรหัสผ่าน
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-[#1C6CB4] transition-colors" size={20} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={loading}
                                        className="pl-12 pr-12 py-3 w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#1C6CB4] focus:border-transparent focus:bg-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder="••••••••"
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-gradient-to-r from-[#1C6CB4] via-[#ED2229] to-[#1C6CB4] text-white rounded-xl font-bold transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1C6CB4]/30 hover:shadow-[#ED2229]/40 transform hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                backgroundSize: '200% 100%',
                                backgroundPosition: loading ? '100% 0' : '0% 0',
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    กำลังดำเนินการ...
                                </>
                            ) : (
                                <>
                                    {isForgotPassword ? <KeyRound size={20} /> : isSignUp ? <UserPlus size={20} /> : <LogIn size={20} />}
                                    {isForgotPassword ? 'ส่งลิงก์รีเซ็ต' : isSignUp ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
                                </>
                            )}
                        </button>


                    </form>

                    {/* Footer Links */}
                    <div className="mt-8 text-center">
                        {isForgotPassword ? (
                            <button
                                onClick={() => toggleMode('login')}
                                className="text-sm font-medium text-slate-500 hover:text-slate-700 flex items-center justify-center gap-2 mx-auto transition-all duration-300 hover:gap-3"
                            >
                                <ArrowLeft size={16} />
                                กลับไปหน้าเข้าสู่ระบบ
                            </button>
                        ) : (
                            <p className="text-sm text-slate-500">
                                {isSignUp ? 'มีบัญชีอยู่แล้ว?' : "ยังไม่มีบัญชี?"}
                                <button
                                    onClick={() => toggleMode(isSignUp ? 'login' : 'signup')}
                                    className="ml-2 font-semibold text-[#1C6CB4] hover:text-[#2a7dc4] transition-colors"
                                >
                                    {isSignUp ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                                </button>
                            </p>
                        )}
                    </div>
                </div>

                {/* Bottom Glow Effect */}
                <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 w-3/4 h-20 bg-[#1C6CB4]/10 rounded-full filter blur-3xl"></div>
            </div>
        </div>
    );
};

export default Login;
