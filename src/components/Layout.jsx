import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { auth } from '../lib/firebase';
import {
    LayoutDashboard,
    Package,
    ScanBarcode,
    ShoppingCart,
    History,
    Menu,
    X,
    LogOut,
    Sparkles,
    RotateCcw,
    QrCode,
    Bell,
    User,
    Users,
    Settings,
    HelpCircle,
    CheckCircle,
    AlertCircle,
    Info,
    FileText,
    Warehouse
} from 'lucide-react';
import clsx from 'clsx';
import InstallPrompt from './InstallPrompt';

const Layout = () => {
    const { isSidebarOpen, toggleSidebar, cart, user } = useStore();
    const { isDark } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();

    // Use notifications hook
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead
    } = useNotifications();

    // State for dropdowns
    // State for dropdowns
    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    // Refs for click outside handling
    const notificationRef = useRef(null);
    const userMenuRef = useRef(null);

    // Handle click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/login');
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle className="text-green-400" size={18} />;
            case 'warning': return <AlertCircle className="text-yellow-400" size={18} />;
            case 'info': return <Info className="text-blue-400" size={18} />;
            default: return <Bell className="text-gray-400" size={18} />;
        }
    };

    // Check if current user is admin
    // Note: Firebase Auth user object doesn't have 'role' in metadata by default unless custom claims are used.
    // For this migration, we might rely on the 'shadow' firestore user profile or just assume 'admin' if not implemented yet.
    // Ideally: fetch user profile from Firestore 'users' collection.
    // For now, let's keep it safe. If we migrated Users.jsx to use Firestore, we should probably fetch the role here.
    // However, to avoid complexity in Layout causing stalls, we can try to read from auth token if custom claims exist,
    // or just fetch the user doc.
    // Let's assume for now we might lose 'admin' check until we wire up context or fetch.
    // Let's try to be smart: if email is specific, or just fetch profile.
    // But wait, `Users.jsx` creates a shadow user.
    // I should create a `useAuth` hook eventually.
    // For now, I will check `user.email` or `user.displayName` if simple.
    // Or I can fetch the user doc from Firestore.
    // Since I don't want to break the UI for admin tabs, I'll fetch the profile.

    // UPDATE: I will fetch the profile from Firestore to get the role.
    const isAdmin = user?.role === 'admin';
    const isStaff = user?.role === 'staff';

    const navItems = [
        { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
        { path: '/products', label: 'อุปกรณ์', icon: Package },
        { path: '/assets', label: 'ครุภัณฑ์', icon: ScanBarcode },
        { path: '/transactions', label: 'ประวัติการเบิก', icon: History },

        // Operations: Admin & Staff Only
        ...((isAdmin || isStaff) ? [
            { path: '/return', label: 'รับคืน', icon: RotateCcw },
            { path: '/scan', label: 'สแกน', icon: QrCode },
            { path: '/warehouses', label: 'คลังสินค้า', icon: Warehouse },
        ] : []),

        // Admin Only
        ...(isAdmin ? [
            { path: '/users', label: 'จัดการผู้ใช้', icon: Users },
            { path: '/audit-log', label: 'ประวัติระบบ', icon: FileText }
        ] : []),
    ];


    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Animated Background Blobs - only show in dark mode */}
            {isDark && (
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#1C6CB4] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#ED2229] rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse" style={{ animationDelay: '1s' }}></div>
                </div>
            )}

            {/* Sidebar */}
            <aside
                style={{
                    background: isDark
                        ? 'rgba(15, 23, 42, 0.9)'
                        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
                    borderColor: 'var(--border-color)',
                    boxShadow: isDark
                        ? '4px 0 20px rgba(0, 0, 0, 0.3)'
                        : '4px 0 30px rgba(30, 64, 175, 0.08), 0 0 60px rgba(28, 108, 180, 0.04)'
                }}
                className={clsx(
                    "fixed inset-y-0 left-0 z-50 w-64 backdrop-blur-xl border-r transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0",
                    !isSidebarOpen && "lg:w-20",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between h-16 px-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div className={clsx("flex items-center gap-3", !isSidebarOpen && "lg:hidden")}>
                        <div className="relative">
                            <div className="w-10 h-10 bg-gradient-to-br from-[#1C6CB4] to-[#ED2229] rounded-xl flex items-center justify-center shadow-lg shadow-[#1C6CB4]/30">
                                <img
                                    src="/logo.png"
                                    alt="FS"
                                    className="w-7 h-7 object-contain"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <span className="font-bold text-sm text-white hidden">FS</span>
                            </div>
                            <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-[#ED2229] animate-pulse" />
                        </div>
                        <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>StockFlow</span>
                    </div>
                    {/* Collapsed Logo */}
                    <div className={clsx("hidden lg:flex items-center justify-center w-full", isSidebarOpen && "!hidden")}>
                        <div className="w-10 h-10 bg-gradient-to-br from-[#1C6CB4] to-[#ED2229] rounded-xl flex items-center justify-center shadow-lg shadow-[#1C6CB4]/30">
                            <span className="font-bold text-sm text-white">FS</span>
                        </div>
                    </div>
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 group",
                                    isActive
                                        ? "bg-gradient-to-r from-[#1C6CB4] to-[#1C6CB4]/80 text-white shadow-lg shadow-[#1C6CB4]/30"
                                        : "",
                                    !isSidebarOpen && "lg:justify-center lg:px-2"
                                )}
                                style={!isActive ? { color: 'var(--text-secondary)' } : {}}
                                title={!isSidebarOpen ? item.label : undefined}
                            >
                                <Icon
                                    size={20}
                                    className={clsx(
                                        "transition-all duration-300",
                                        isActive ? "text-white" : "group-hover:scale-110"
                                    )}
                                />
                                <span className={clsx(
                                    "font-medium transition-all duration-300",
                                    !isSidebarOpen && "lg:hidden"
                                )}>{item.label}</span>
                                {/* Active indicator */}
                                {isActive && (
                                    <span className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full animate-pulse hidden lg:block" />
                                )}
                            </Link>
                        );
                    })}
                </nav>


            </aside>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={toggleSidebar}
                />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Header */}
                <header
                    style={{
                        background: isDark
                            ? 'rgba(15, 23, 42, 0.6)'
                            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                        borderColor: 'var(--border-color)',
                        boxShadow: isDark
                            ? '0 4px 20px rgba(0, 0, 0, 0.2)'
                            : '0 4px 20px rgba(30, 64, 175, 0.06), 0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}
                    className="h-16 backdrop-blur-xl border-b flex items-center justify-between px-4 lg:px-6 relative z-[80]"
                >
                    <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-xl transition-all duration-200"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <Menu size={20} />
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Notification Bell */}
                        <div className="relative" ref={notificationRef}>
                            <button
                                onClick={() => {
                                    setShowNotifications(!showNotifications);
                                    setShowUserMenu(false);
                                }}
                                className="relative p-2.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all duration-200 icon-bounce"
                            >
                                <Bell size={20} />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-[#ED2229] rounded-full animate-pulse">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notification Dropdown */}
                            {showNotifications && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={() => setShowNotifications(false)} />
                                    <div className="absolute top-full right-0 mt-2 w-80 backdrop-blur-xl bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden z-[70] scale-in">
                                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                                            <h3 className="font-bold text-slate-800">การแจ้งเตือน</h3>
                                            {unreadCount > 0 && (
                                                <button
                                                    onClick={markAllAsRead}
                                                    className="text-xs text-[#5ca0dc] hover:text-[#1C6CB4] transition-colors"
                                                >
                                                    อ่านทั้งหมด
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                            {notifications.length > 0 ? (
                                                notifications.map((notification) => (
                                                    <div
                                                        key={notification.id}
                                                        onClick={() => markAsRead(notification.id)}
                                                        className={clsx(
                                                            "p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors",
                                                            !notification.read && "bg-blue-50"
                                                        )}
                                                    >
                                                        <div className="flex gap-3">
                                                            <div className="flex-shrink-0 mt-0.5">
                                                                {getNotificationIcon(notification.type)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                                                                <p className="text-xs text-slate-500 mt-0.5">{notification.message}</p>
                                                                <p className="text-xs text-slate-400 mt-1">{notification.time}</p>
                                                            </div>
                                                            {!notification.read && (
                                                                <div className="w-2 h-2 bg-[#1C6CB4] rounded-full flex-shrink-0 mt-2"></div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-8 text-center text-slate-400">
                                                    <Bell className="mx-auto mb-2 opacity-50" size={32} />
                                                    <p>ไม่มีการแจ้งเตือน</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Cart - Only for Admin/Staff */}
                        {(isAdmin || isStaff) && (
                            <Link
                                to="/cart"
                                className="relative p-2.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all duration-200 icon-bounce"
                            >
                                <ShoppingCart size={20} />
                                {cart.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-r from-[#ED2229] to-[#ff4444] rounded-full shadow-lg shadow-[#ED2229]/50 animate-pulse">
                                        {cart.reduce((acc, item) => acc + item.cartQuantity, 0)}
                                    </span>
                                )}
                            </Link>
                        )}

                        {/* User Avatar */}
                        <div className="relative ml-2 pl-3 border-l border-white/10" ref={userMenuRef}>
                            <button
                                onClick={() => {
                                    setShowUserMenu(!showUserMenu);
                                    setShowNotifications(false);
                                }}
                                className="flex items-center gap-3 p-1 rounded-xl hover:bg-white/10 transition-all duration-200"
                            >
                                <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-[#1C6CB4]/30 transition-transform hover:scale-105">
                                    {user?.photoURL ? (
                                        <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-[#1C6CB4] to-[#5ca0dc] flex items-center justify-center text-white font-bold text-sm">
                                            {user?.email?.charAt(0).toUpperCase() || 'A'}
                                        </div>
                                    )}
                                </div>
                            </button>

                            {showUserMenu && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={() => setShowUserMenu(false)} />
                                    <div className="absolute top-full right-0 mt-2 w-64 backdrop-blur-xl bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden z-[70] scale-in">
                                        {/* User Info */}
                                        <div className="p-4 border-b border-slate-200">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg shadow-[#1C6CB4]/30">
                                                    {user?.photoURL ? (
                                                        <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gradient-to-br from-[#1C6CB4] to-[#5ca0dc] flex items-center justify-center text-white font-bold text-lg">
                                                            {user?.email?.charAt(0).toUpperCase() || 'A'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate text-slate-800">
                                                        {user?.displayName || 'Admin User'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {user?.email || 'admin@example.com'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Menu Items */}
                                        <div className="p-2">
                                            <Link
                                                to="/profile"
                                                onClick={() => setShowUserMenu(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                            >
                                                <User size={18} />
                                                <span className="text-sm">โปรไฟล์</span>
                                            </Link>
                                            <Link
                                                to="/settings"
                                                onClick={() => setShowUserMenu(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                            >
                                                <Settings size={18} />
                                                <span className="text-sm">ตั้งค่า</span>
                                            </Link>
                                            <Link
                                                to="/help"
                                                onClick={() => setShowUserMenu(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                            >
                                                <HelpCircle size={18} />
                                                <span className="text-sm">ช่วยเหลือ</span>
                                            </Link>
                                        </div>

                                        {/* Logout */}
                                        <div className="p-2 border-t border-slate-200">
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#ED2229] hover:bg-[#ED2229]/10 transition-colors"
                                            >
                                                <LogOut size={18} />
                                                <span className="text-sm font-medium">ออกจากระบบ</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-4 lg:p-6">
                    <Outlet />
                </main>
            </div>

            {/* PWA Install Prompt */}
            <InstallPrompt />
        </div>
    );
};

export default Layout;
