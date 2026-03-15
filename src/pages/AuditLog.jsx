import React, { useState, useEffect, useCallback } from 'react';
import {
    FileText,
    Search,
    Filter,
    Download,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Calendar,
    RefreshCw,
    FileSpreadsheet,
    Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useAuditLog } from '../hooks/useAuditLog';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import { useStore } from '../store/useStore';
import { auth } from '../lib/firebase';

const AuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [exporting, setExporting] = useState(false);
    const itemsPerPage = 20;

    // Filters
    const [filters, setFilters] = useState({
        entityType: 'all',
        action: 'all',
        search: '',
        startDate: '',
        endDate: ''
    });
    const [showFilters, setShowFilters] = useState(false);

    const { fetchAuditLogs, exportToCSV, exportToPDF } = useAuditLog();
    const { user: storeUser } = useStore();

    // Use auth.currentUser directly or storeUser
    const isAdmin = storeUser?.role === 'admin';

    // Calculate Slice for Pagination (since hook fetches limit, we simulate basic paging on client if small data, 
    // or hook fetches simplified list)
    // Hook implementation: fetches `limit` (default 100) most recent.
    // If we want pagination, we should probably fetch more or update hook.
    // For now, let's fetch a larger batch (e.g. 200) and client-paginate, 
    // assuming valid use case is checking recent history.

    // To support "Load More", we could change UI. 
    // But let's stick to existing UI with client-side slicing of the fetched results.

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch a reasonable amount for client side paging
            const { data } = await fetchAuditLogs({
                ...filters,
                limit: 500 // Increase limit to allow some client-side navigation
            });
            setLogs(data);
            setTotalCount(data.length);
            setCurrentPage(1); // Reset to page 1 on new fetch
        } catch (err) {
            console.error('Error loading logs:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchAuditLogs, filters]); // removed currentPage dependency to avoid loop if we change it there

    useEffect(() => {
        if (isAdmin) {
            loadLogs();
        } else {
            setLoading(false);
        }
    }, [loadLogs, isAdmin]);

    const handleExportCSV = async () => {
        setExporting(true);
        try {
            exportToCSV(logs);
        } finally {
            setExporting(false);
        }
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            await exportToPDF(logs);
        } finally {
            setExporting(false);
        }
    };

    const getActionBadge = (action) => {
        const styles = {
            create: 'bg-green-100 text-green-700 border-green-200',
            update: 'bg-blue-100 text-blue-700 border-blue-200',
            delete: 'bg-red-100 text-red-700 border-red-200'
        };
        const labels = { create: 'สร้าง', update: 'แก้ไข', delete: 'ลบ' };

        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${styles[action] || 'bg-gray-100 text-gray-700'}`}>
                {labels[action] || action}
            </span>
        );
    };

    const getEntityBadge = (entityType) => {
        const styles = {
            product: 'bg-purple-100 text-purple-700',
            asset: 'bg-orange-100 text-orange-700',
            transaction: 'bg-cyan-100 text-cyan-700',
            user: 'bg-pink-100 text-pink-700'
        };
        const labels = { product: 'อุปกรณ์', asset: 'ครุภัณฑ์', transaction: 'การเบิก', user: 'ผู้ใช้' };

        return (
            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${styles[entityType] || 'bg-gray-100 text-gray-700'}`}>
                {labels[entityType] || entityType}
            </span>
        );
    };

    // Client-side Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentLogs = logs.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(totalCount / itemsPerPage);

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="glass-card p-8 text-center max-w-md">
                    <Shield className="mx-auto text-red-500 mb-4" size={48} />
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        ไม่มีสิทธิ์เข้าถึง
                    </h2>
                    <p className="text-gray-500">
                        กรุณาเข้าสู่ระบบ
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-100 rounded-xl">
                        <FileText className="text-indigo-600" size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            ประวัติระบบ
                        </h1>
                        <p className="text-sm text-gray-500">แสดงรายการล่าสุด (สูงสุด 500 รายการ)</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={loadLogs}
                        className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                        title="รีเฟรช"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition-colors disabled:opacity-50"
                    >
                        <FileSpreadsheet size={18} />
                        <span className="hidden sm:inline">CSV</span>
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                        <Download size={18} />
                        <span className="hidden sm:inline">PDF</span>
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="glass-card p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="ค้นหาตามชื่อหรืออีเมล..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            className="glass-input pl-12 w-full"
                        />
                    </div>

                    {/* Toggle Filters */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors ${showFilters ? 'bg-[#1C6CB4] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        <Filter size={18} />
                        ตัวกรอง
                        <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {/* Expanded Filters */}
                {showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                        {/* Entity Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">ประเภท</label>
                            <select
                                value={filters.entityType}
                                onChange={(e) => setFilters(prev => ({ ...prev, entityType: e.target.value }))}
                                className="glass-select w-full"
                            >
                                <option value="all">ทั้งหมด</option>
                                <option value="product">อุปกรณ์</option>
                                <option value="asset">ครุภัณฑ์</option>
                                <option value="transaction">การเบิก</option>
                                <option value="user">ผู้ใช้</option>
                            </select>
                        </div>

                        {/* Action */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">การกระทำ</label>
                            <select
                                value={filters.action}
                                onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                                className="glass-select w-full"
                            >
                                <option value="all">ทั้งหมด</option>
                                <option value="create">สร้าง</option>
                                <option value="update">แก้ไข</option>
                                <option value="delete">ลบ</option>
                            </select>
                        </div>

                        {/* Start Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">ตั้งแต่วันที่</label>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                className="glass-input w-full"
                            />
                        </div>

                        {/* End Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">ถึงวันที่</label>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                className="glass-input w-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Logs Table */}
            {loading ? (
                <LoadingSpinner message="กำลังโหลดประวัติ..." />
            ) : currentLogs.length > 0 ? (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                                    <th className="text-left p-4 font-semibold text-gray-600">วันที่/เวลา</th>
                                    <th className="text-left p-4 font-semibold text-gray-600">ผู้ใช้</th>
                                    <th className="text-left p-4 font-semibold text-gray-600">การกระทำ</th>
                                    <th className="text-left p-4 font-semibold text-gray-600">ประเภท</th>
                                    <th className="text-left p-4 font-semibold text-gray-600">รายการ</th>
                                    <th className="text-left p-4 font-semibold text-gray-600">รายละเอียด</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentLogs.map((log, index) => (
                                    <tr
                                        key={log.id || index}
                                        className="border-b hover:bg-gray-50 transition-colors"
                                        style={{ borderColor: 'var(--border-color)' }}
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="text-gray-400" size={14} />
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {format(new Date(log.created_at), 'd MMM yyyy', { locale: th })}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {format(new Date(log.created_at), 'HH:mm:ss')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1C6CB4] to-[#ED2229] flex items-center justify-center text-white text-xs font-bold">
                                                    {(log.user_name || log.user_email || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {log.user_name || '-'}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate max-w-[150px]">
                                                        {log.user_email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="p-4">
                                            {getEntityBadge(log.entity_type)}
                                        </td>
                                        <td className="p-4">
                                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {log.entity_name || '-'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                ID: {log.entity_id}
                                            </p>
                                        </td>
                                        <td className="p-4">
                                            <div className="max-w-[200px]">
                                                {log.action === 'update' && log.old_values && log.new_values ? (
                                                    <div className="text-xs space-y-1">
                                                        <p className="text-red-500 line-through truncate">
                                                            {typeof log.old_values === 'object' ? JSON.stringify(log.old_values).substring(0, 50) : log.old_values}
                                                        </p>
                                                        <p className="text-green-600 truncate">
                                                            {typeof log.new_values === 'object' ? JSON.stringify(log.new_values).substring(0, 50) : log.new_values}
                                                        </p>
                                                    </div>
                                                ) : log.new_values ? (
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {typeof log.new_values === 'object' ? JSON.stringify(log.new_values).substring(0, 80) : log.new_values}
                                                    </p>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                            <p className="text-sm text-gray-500">
                                แสดง {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} จาก {totalCount} รายการ
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="px-3 py-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <EmptyState
                    icon={FileText}
                    title="ไม่พบประวัติ"
                    description="ยังไม่มีการบันทึกประวัติการเปลี่ยนแปลง หรือไม่พบข้อมูลตามตัวกรอง"
                    actionLabel="ล้างตัวกรอง"
                    onAction={() => setFilters({
                        entityType: 'all',
                        action: 'all',
                        search: '',
                        startDate: '',
                        endDate: ''
                    })}
                />
            )}
        </div>
    );
};

export default AuditLog;
