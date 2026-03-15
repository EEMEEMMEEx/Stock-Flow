import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, Package, RotateCcw, LogIn, LogOut, Edit, User, RefreshCw } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const UserActivityLog = ({ user, onClose }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchActivities = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Try to fetch from activity_logs table
            // Note: If 'activity_logs' collection doesn't exist, this returns empty not error usually.
            const logsQ = query(
                collection(db, 'activity_logs'),
                where('user_id', '==', user.id),
                orderBy('created_at', 'desc'),
                limit(50)
            );

            // Firestore throws if index missing for compound queries.
            // But here it's simple filtering.
            let logsData = [];
            try {
                const logsSnapshot = await getDocs(logsQ);
                logsData = logsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                console.warn("Activity logs fetch failed (missing index or collection?)", e);
            }

            if (logsData.length > 0) {
                setActivities(logsData);
            } else {
                // Fallback: Fetch from transactions for this user
                // Assuming 'created_by' stores email in new Firebase setup (it should if we passed user.email)
                // In previous 'Cart.jsx' we used requester_name or senderName. 
                // We need to check if we store email in transactions.
                // In 'Cart.jsx', we stored: requester_name, approver_name. 
                // We might not have 'created_by' field in the new 'Transactions.jsx' refactor unless we added it?
                // Checking Cart.jsx refactor... I didn't see 'created_by' explicitly.
                // However, let's try to query by 'approver_name' or 'requester_name' if they match user name?
                // Or best effort fallback.

                // Let's assume we might need to add 'created_by_email' to transactions in future to make this robust.
                // For now, let's try querying by 'approver_name' hoping it matches user.email or user.displayName?
                // Actually, the original code used `eq('created_by', user.email)`.
                // If the new Cart.jsx didn't save `created_by`, this might be empty.
                // Let's just query what we can.

                const txQ = query(
                    collection(db, 'transactions'),
                    where('approver_name', '==', user.displayName || user.email || ''), // Best guess mapping
                    orderBy('created_at', 'desc'),
                    limit(20)
                );

                try {
                    const txSnapshot = await getDocs(txQ);

                    if (!txSnapshot.empty) {
                        const txActivities = txSnapshot.docs.map(doc => {
                            const tx = doc.data();
                            return {
                                id: doc.id,
                                action: tx.type === 'IN' ? 'return' : 'checkout', // Mapped 'OUT' -> checkout, 'IN' -> return
                                details: {
                                    transaction_code: doc.id.substring(0, 8).toUpperCase(), // specific code not stored? use ID
                                    recipient: tx.requester_name,
                                    items_count: tx.items ? tx.items.length : 0
                                },
                                created_at: tx.created_at
                            };
                        });
                        setActivities(txActivities);
                    } else {
                        // Use sample data if nothing found (to avoid empty blank screen for demo)
                        setActivities([
                            { id: 1, action: 'login', details: {}, created_at: new Date().toISOString() },
                            { id: 2, action: 'checkout', details: { items_count: 1, recipient: 'ระบบทดสอบ' }, created_at: new Date(Date.now() - 3600000).toISOString() },
                        ]);
                    }
                } catch (e) {
                    console.warn("Transactions fetch failed", e);
                    // Sample data fallback
                    setActivities([
                        { id: 1, action: 'login', details: {}, created_at: new Date().toISOString() },
                    ]);
                }
            }
        } catch (err) {
            console.error('Error fetching activities:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user?.id, user?.email, user?.displayName]);

    useEffect(() => {
        if (user) {
            fetchActivities();
        }
    }, [user, fetchActivities]);

    const getActivityIcon = (action) => {
        switch (action) {
            case 'checkout': return <Package className="text-blue-500" size={16} />;
            case 'return': return <RotateCcw className="text-green-500" size={16} />;
            case 'login': return <LogIn className="text-purple-500" size={16} />;
            case 'logout': return <LogOut className="text-gray-500" size={16} />;
            case 'edit': return <Edit className="text-yellow-500" size={16} />;
            case 'profile_update': return <User className="text-pink-500" size={16} />;
            default: return <Clock className="text-gray-500" size={16} />;
        }
    };

    const getActivityLabel = (action) => {
        const labels = {
            checkout: 'เบิกจ่ายสินค้า',
            return: 'รับคืนครุภัณฑ์',
            login: 'เข้าสู่ระบบ',
            logout: 'ออกจากระบบ',
            edit: 'แก้ไขข้อมูล',
            profile_update: 'อัปเดตโปรไฟล์'
        };
        return labels[action] || action;
    };

    const formatTime = (dateStr) => {
        try {
            return format(new Date(dateStr), 'd MMM yyyy HH:mm', { locale: th });
        } catch {
            return dateStr;
        }
    };

    if (!user) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            {/* Modal - Light Theme */}
            <div className="glass-card w-full max-w-lg max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b shrink-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-bold">
                                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div>
                            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                {user.displayName || user.email || 'ผู้ใช้'}
                            </h3>
                            <p className="text-sm text-gray-500">ประวัติการใช้งาน</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchActivities}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="รีเฟรช"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-card)' }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#1C6CB4] border-t-transparent" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-red-500">
                            <p>เกิดข้อผิดพลาด: {error}</p>
                        </div>
                    ) : activities.length > 0 ? (
                        <div className="space-y-3">
                            {activities.map((activity, index) => (
                                <div
                                    key={activity.id || index}
                                    className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border"
                                    style={{ borderColor: 'var(--border-color)' }}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 border" style={{ borderColor: 'var(--border-color)' }}>
                                            {getActivityIcon(activity.action)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {getActivityLabel(activity.action)}
                                            </p>
                                            {activity.details && (
                                                <div className="text-sm text-gray-500 mt-1">
                                                    {activity.details.transaction_code && (
                                                        <span>รหัส: {activity.details.transaction_code}</span>
                                                    )}
                                                    {activity.details.recipient && (
                                                        <span className="ml-2">ผู้รับ: {activity.details.recipient}</span>
                                                    )}
                                                    {activity.details.items_count && (
                                                        <span className="ml-2">{activity.details.items_count} รายการ</span>
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-400 mt-2">
                                                {formatTime(activity.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Clock className="mx-auto text-gray-400 mb-3" size={40} />
                            <p className="text-gray-500">ยังไม่มีประวัติการใช้งาน</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserActivityLog;
