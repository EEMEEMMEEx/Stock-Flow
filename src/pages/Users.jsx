import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import {
    Users as UsersIcon,
    Search,
    Plus,
    Pencil,
    Trash2,
    Shield,
    User,
    Eye,
    Filter,
    Mail,
    Building,
    Phone,
    Clock,
    ChevronDown,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { LoadingSpinner, ErrorDisplay, EmptyState } from '../components/UIStates';
import UserFormModal from '../components/UserFormModal';
import UserActivityLog from '../components/UserActivityLog';
import { useStore } from '../store/useStore';

const Users = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [showRoleFilter, setShowRoleFilter] = useState(false);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'pending'

    // Modal states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [selectedUserForActivity, setSelectedUserForActivity] = useState(null);

    const { user: currentUser } = useStore();
    // Check for admin role
    const isAdmin = currentUser?.role === 'admin';

    // Fetch users from Firestore
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError(null);

            const usersRef = collection(db, 'users');
            // Try to order by created_at, but if index missing, it might fail. 
            // Fallback to client side sort or simple fetch if needed.
            const q = query(usersRef, orderBy('created_at', 'desc'));

            let snapshot;
            try {
                snapshot = await getDocs(q);
            } catch (err) {
                console.warn("Index might be missing, fetching without sort", err);
                snapshot = await getDocs(usersRef);
            }

            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (data.length === 0 && auth.currentUser) {
                // If it's the first run and empty, maybe show the current user at least?
                // Or just show empty state.
            }

            setUsers(data);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = () => {
        setEditingUser(null);
        setIsFormOpen(true);
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setIsFormOpen(true);
    };

    const handleDeleteUser = async (user) => {
        if (user.id === currentUser?.uid) { // Firebase uses 'uid'
            alert('ไม่สามารถลบบัญชีของตัวเองได้');
            return;
        }

        if (!window.confirm(`คุณแน่ใจหรือไม่ที่จะลบผู้ใช้ "${user.full_name || user.email}"?`)) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id));
            setUsers(prev => prev.filter(u => u.id !== user.id));
        } catch (err) {
            console.error('Error deleting user:', err);
            alert('ไม่สามารถลบผู้ใช้ได้: ' + err.message);
        }
    };

    const handleSaveUser = async (userData) => {
        try {
            if (editingUser) {
                // Update existing user
                const userRef = doc(db, 'users', editingUser.id);
                // Don't overwrite created_at if it exists, or everything?
                // userData comes from form, so it's partial or full.
                await updateDoc(userRef, userData);

                setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...userData } : u));
            } else {
                // Add new "shadow" user to Firestore
                // Note: This won't create an Auth user. 
                // In a real app, you'd trigger a Cloud Function or use Admin SDK.
                const newUser = {
                    ...userData,
                    created_at: new Date().toISOString(),
                    role: userData.role || 'viewer' // Default role
                };
                const docRef = await addDoc(collection(db, 'users'), newUser);
                setUsers(prev => [{ id: docRef.id, ...newUser }, ...prev]);
            }
            setIsFormOpen(false);
        } catch (err) {
            console.error('Error saving user:', err);
            throw err;
        }
    };

    const handleApproveUser = async (user) => {
        if (!window.confirm(`อนุมัติผู้ใช้ "${user.full_name || user.email}" ให้เข้าใช้งานหรือไม่?`)) return;

        try {
            const userRef = doc(db, 'users', user.id);
            await updateDoc(userRef, {
                status: 'active',
                role: 'viewer' // Default role upon approval, can be changed later
            });
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: 'active', role: 'viewer' } : u));
        } catch (err) {
            console.error('Error approving user:', err);
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    };

    const handleRejectUser = async (user) => {
        if (!window.confirm(`ปฏิเสธและลบผู้ใช้ "${user.full_name || user.email}" หรือไม่?`)) return;
        // Basically delete the user doc
        handleDeleteUser(user);
    };

    const getRoleBadge = (role) => {
        const badges = {
            admin: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: Shield, label: 'Admin' },
            staff: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: User, label: 'Staff' },
            viewer: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Eye, label: 'Viewer' }
        };
        // Special case for pending
        if (role === 'pending_role') return <span className="text-gray-400">รออนุมัติ</span>;
        const badge = badges[role] || badges.viewer;
        const Icon = badge.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${badge.bg} ${badge.text}`}>
                <Icon size={12} />
                {badge.label}
            </span>
        );
    };

    // Filter users
    const filteredUsers = users.filter(user => {
        const matchesSearch =
            (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.department && user.department.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesRole = roleFilter === 'all' || user.role === roleFilter;

        // Filter by tab status
        const isPending = user.status === 'pending';
        const matchesTab = activeTab === 'pending' ? isPending : (!isPending || !user.status); // Default to active if no status

        return matchesSearch && matchesRole && matchesTab;
    });

    const pendingCount = users.filter(u => u.status === 'pending').length;


    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="glass-premium p-8 text-center max-w-md">
                    <Shield className="mx-auto text-red-400 mb-4" size={48} />
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        ไม่มีสิทธิ์เข้าถึง
                    </h2>
                    <p className="text-gray-400">
                        เฉพาะ Admin เท่านั้นที่สามารถจัดการผู้ใช้ได้
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return <LoadingSpinner message="กำลังโหลดรายการผู้ใช้..." />;
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={fetchUsers} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/20 rounded-xl">
                        <UsersIcon className="text-purple-400" size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            จัดการผู้ใช้
                        </h1>
                        <p className="text-sm text-gray-400">{users.length} ผู้ใช้ในระบบ</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={handleAddUser}
                        className="btn-gradient flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        เพิ่มผู้ใช้
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-200/20">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`pb-3 px-1 relative font-medium transition-colors ${activeTab === 'active' ? 'text-[#1C6CB4]' : 'text-gray-400 hover:text-gray-300'
                        }`}
                >
                    ผู้ใช้ทั้งหมด
                    {activeTab === 'active' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#1C6CB4] rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`pb-3 px-1 relative font-medium transition-colors flex items-center gap-2 ${activeTab === 'pending' ? 'text-yellow-500' : 'text-gray-400 hover:text-gray-300'
                        }`}
                >
                    <span className="relative">
                        รอการอนุมัติ
                        {pendingCount > 0 && (
                            <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                    </span>
                    {pendingCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-white/10 text-xs rounded-md">
                            {pendingCount}
                        </span>
                    )}
                    {activeTab === 'pending' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500 rounded-full" />
                    )}
                </button>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="ค้นหาผู้ใช้..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glass-input pl-12 w-full"
                    />
                </div>

                {/* Role Filter */}
                <div className="relative">
                    <button
                        onClick={() => setShowRoleFilter(!showRoleFilter)}
                        className="glass-input flex items-center justify-between gap-2 min-w-[160px]"
                    >
                        <span className="flex items-center gap-2">
                            <Filter size={16} />
                            {roleFilter === 'all' ? 'ทุกบทบาท' : getRoleBadge(roleFilter)}
                        </span>
                        <ChevronDown size={16} />
                    </button>

                    {showRoleFilter && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-slate-900/95 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                            {[
                                { value: 'all', label: 'ทุกบทบาท' },
                                { value: 'admin', label: 'Admin' },
                                { value: 'staff', label: 'Staff' },
                                { value: 'viewer', label: 'Viewer' }
                            ].map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => {
                                        setRoleFilter(option.value);
                                        setShowRoleFilter(false);
                                    }}
                                    className={`w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors ${roleFilter === option.value ? 'bg-white/5 text-white' : 'text-gray-400'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Users Grid */}
            {filteredUsers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredUsers.map(user => (
                        <div
                            key={user.id}
                            className="glass-card p-6 hover:bg-white/10 transition-all duration-300 group"
                        >
                            {/* User Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-white font-bold text-lg">
                                                {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                            {user.full_name || 'ไม่ระบุชื่อ'}
                                        </h3>
                                        {getRoleBadge(user.role)}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => setSelectedUserForActivity(user)}
                                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                                        title="ดูประวัติ"
                                    >
                                        <Clock size={16} />
                                    </button>

                                    {/* Action Buttons based on Tab */}
                                    {activeTab === 'pending' ? (
                                        <>
                                            <button
                                                onClick={() => handleApproveUser(user)}
                                                className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                                                title="อนุมัติ"
                                            >
                                                <CheckCircle size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleRejectUser(user)}
                                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                title="ปฏิเสธ"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleEditUser(user)}
                                                className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors"
                                                title="แก้ไข"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            {user.id !== currentUser?.uid && (
                                                <button
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                    title="ลบ"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </>
                                    )}

                                </div>
                            </div>

                            {/* User Info */}
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-gray-400">
                                    <Mail size={14} />
                                    <span className="truncate">{user.email}</span>
                                </div>
                                {user.department && (
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Building size={14} />
                                        <span>{user.department}</span>
                                    </div>
                                )}
                                {user.phone && (
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Phone size={14} />
                                        <span>{user.phone}</span>
                                    </div>
                                )}
                            </div>

                            {/* Last Login */}
                            {user.last_sign_in && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <p className="text-xs text-gray-500">
                                        เข้าสู่ระบบล่าสุด: {new Date(user.last_sign_in).toLocaleDateString('th-TH')}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={activeTab === 'pending' ? Clock : UsersIcon}
                    title={activeTab === 'pending' ? "ไม่มีคำขอรออนุมัติ" : "ไม่พบผู้ใช้"}
                    description={
                        activeTab === 'pending'
                            ? "ยังไม่มีใครสมัครสมาชิกใหม่เข้ามาในช่วงนี้"
                            : (searchTerm ? 'ลองค้นหาด้วยคำค้นอื่น' : 'ยังไม่มีผู้ใช้ในระบบ')
                    }
                    action={
                        activeTab !== 'pending' && (
                            <button onClick={handleAddUser} className="btn-gradient">
                                <Plus size={18} /> เพิ่มผู้ใช้
                            </button>
                        )
                    }
                />
            )}

            {/* Form Modal */}
            <UserFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleSaveUser}
                user={editingUser}
            />

            {/* Activity Log Modal */}
            {selectedUserForActivity && (
                <UserActivityLog
                    user={selectedUserForActivity}
                    onClose={() => setSelectedUserForActivity(null)}
                />
            )}
        </div>
    );
};

export default Users;
