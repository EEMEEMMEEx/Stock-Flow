import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Clock, LogOut, CheckCircle } from 'lucide-react';

const PendingApproval = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 to-orange-500"></div>

                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Clock className="w-10 h-10 text-yellow-600 animate-pulse" />
                </div>

                <h1 className="text-2xl font-bold text-slate-800 mb-2">
                    รอการอนุมัติจากผู้ดูแล
                </h1>

                <p className="text-slate-600 mb-8">
                    บัญชีของคุณถูกสร้างเรียบร้อยแล้ว แต่ต้องรอการตรวจสอบสิทธิ์จาก Admin ก่อนเข้าใช้งาน <br />
                    กรุณาตรวจสอบอีเมลหรือกลับมาเช็คสถานะภายหลัง
                </p>

                <div className="bg-slate-50 rounded-xl p-4 mb-8 text-sm text-slate-500">
                    <p className="font-medium text-slate-700 mb-1">สถานะปัจจุบัน:</p>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                        <Clock size={12} /> Pending Approval
                    </span>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
                >
                    <LogOut size={18} />
                    ออกจากระบบ
                </button>
            </div>
        </div>
    );
};

export default PendingApproval;
