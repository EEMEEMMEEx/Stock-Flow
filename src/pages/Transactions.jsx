import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { Package, User, Calendar, CheckCircle, Printer, Download, Search, History } from 'lucide-react';
import { generatePDF } from '../utils/pdfGenerator';
import { LoadingSpinner, ErrorDisplay } from '../components/UIStates';

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchTransactions();
    }, []);

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            setError(null);

            const q = query(collection(db, 'transactions'), orderBy('created_at', 'desc'));
            const snapshot = await getDocs(q);

            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setTransactions(data);
        } catch (err) {
            console.error('Error fetching transactions:', err);
            setError(err.message || 'ไม่สามารถโหลดประวัติการเบิกจ่ายได้');
        } finally {
            setLoading(false);
        }
    };

    const handleReprint = async (tx) => {
        try {
            // Function to parse Serial Numbers from note
            // Note Format: "....\n\n[Serial Numbers]\nProduct Name: SN1, SN2"
            const extractSNs = (productName, note) => {
                if (!note) return [];
                const snSectionMatch = note.match(/\[Serial Numbers\]\s*([\s\S]*)/);
                if (!snSectionMatch) return [];

                const snSection = snSectionMatch[1];
                const lines = snSection.split('\n');
                for (const line of lines) {
                    // Check if line starts with product name (flexible check)
                    if (line.includes(productName)) {
                        const parts = line.split(':');
                        if (parts.length > 1) {
                            return parts[1].split(',').map(s => s.trim());
                        }
                    }
                }
                return [];
            };

            const cartItems = (tx.items || []).map(item => {
                const productName = item.product_name || item.name || 'Unknown Item';
                const serialNumbers = extractSNs(productName, tx.note);
                return {
                    name: productName,
                    cartQuantity: item.quantity,
                    serialNumbers: serialNumbers
                };
            });

            const transactionWithMeta = {
                ...tx,
                delivery_location: tx.delivery_location || '-',
                note: tx.note || '-'
            };

            await generatePDF(transactionWithMeta, tx.approver_name || '-', cartItems);
        } catch (error) {
            console.error("Error reprinting receipt:", error);
            alert("เกิดข้อผิดพลาดในการพิมพ์ใบเบิก");
        }
    };

    const handleExportCSV = () => {
        const headers = ["Transaction ID", "Date", "Requester", "Approver", "Items"];

        const rows = filteredTransactions.map(tx => {
            const date = format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm:ss');
            const items = (tx.items || []).map(item =>
                `${item.product_name || item.name} (x${item.quantity})`
            ).join('; ');

            return [
                tx.id,
                date,
                tx.requester_name || '-',
                tx.approver_name || '-',
                `"${items}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `transactions_export_${format(new Date(), 'yyyyMMdd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filter Logic
    const filteredTransactions = transactions.filter(tx => {
        const matchesSearch = (tx.requester_name || '').toLowerCase().includes(searchTerm.toLowerCase());

        let matchesDate = true;
        if (startDate && endDate) {
            const txDate = new Date(tx.created_at);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matchesDate = txDate >= start && txDate <= end;
        }

        return matchesSearch && matchesDate;
    });

    if (loading) {
        return <LoadingSpinner message="กำลังโหลดประวัติการเบิกจ่าย..." />;
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={fetchTransactions} title="ไม่สามารถโหลดข้อมูลได้" />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#1C6CB4]/20 rounded-xl">
                        <History className="text-[#5ca0dc]" size={28} />
                    </div>
                    <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>ประวัติการเบิกจ่าย</h1>
                </div>
                <button
                    onClick={handleExportCSV}
                    className="btn-blue flex items-center gap-2 w-full sm:w-auto justify-center"
                >
                    <Download size={20} />
                    Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 flex flex-col md:flex-row gap-4 backdrop-blur-2xl border border-white/10 shadow-xl shadow-[#1C6CB4]/5">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อผู้เบิก..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glass-input pl-12 w-full sm:w-80"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-gray-400">วันที่:</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="glass-input py-2"
                    />
                    <span className="text-gray-400">ถึง</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="glass-input py-2"
                    />
                </div>
            </div>

            {/* Transactions List */}
            <div className="space-y-4">
                {filteredTransactions.map((tx) => (
                    <div key={tx.id} className="glass-card-hover overflow-hidden border-l-4 border-transparent hover:border-l-[#1C6CB4] transition-all duration-300 group">
                        {/* Header */}
                        <div className="p-4 bg-white/5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-4 md:gap-6">
                                <div className="flex items-center gap-2 text-gray-400">
                                    <Calendar size={18} />
                                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{format(new Date(tx.created_at), 'PPpp')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                    <User size={18} />
                                    <span className="text-sm">ผู้เบิก: <span className="font-medium" style={{ color: "var(--text-primary)" }}>{tx.requester_name || '-'}</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                    <CheckCircle size={18} />
                                    <span className="text-sm">ผู้อนุมัติ: <span className="font-medium" style={{ color: "var(--text-primary)" }}>{tx.approver_name || '-'}</span></span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-sm text-gray-500 font-mono">
                                    รหัส: {tx.id.slice(0, 8)}...
                                </div>
                                <button
                                    onClick={() => handleReprint(tx)}
                                    className="flex items-center gap-2 text-[#5ca0dc] hover:text-white bg-[#1C6CB4]/20 hover:bg-[#1C6CB4]/40 px-4 py-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-[#1C6CB4]/30 hover:scale-105"
                                    title="พิมพ์ใบเบิกย้อนหลัง"
                                >
                                    <Printer size={16} />
                                    <span className="text-sm font-medium">พิมพ์ใบเบิก</span>
                                </button>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="p-4">
                            <div className="space-y-2">
                                {(tx.items || []).map((item, index) => {
                                    // Helper to find SNs for this item from the transaction note
                                    const getSerialNumbersFromNote = (note, productName) => {
                                        if (!note) return null;
                                        const snSectionMatch = note.match(/\[Serial Numbers\]\s*([\s\S]*)/);
                                        if (!snSectionMatch) return null;
                                        const snSection = snSectionMatch[1];
                                        const lines = snSection.split('\n');
                                        for (const line of lines) {
                                            if (line.includes(productName)) {
                                                const parts = line.split(':');
                                                if (parts.length > 1) {
                                                    return parts[1].trim();
                                                }
                                            }
                                        }
                                        return null;
                                    };

                                    const productName = item.product_name || item.name || 'Unknown';
                                    const serialNumbers = getSerialNumbersFromNote(tx.note, productName);

                                    return (
                                        <div key={index} className="flex flex-col border-b border-white/5 last:border-0 py-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-[#1C6CB4]/20 rounded-lg text-[#5ca0dc]">
                                                        <Package size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                                                            {productName}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            รหัสอุปกรณ์: {item.product_sku || item.sku || '-'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="font-semibold bg-white/5 px-3 py-1 rounded-lg" style={{ color: "var(--text-primary)" }}>
                                                    x{item.quantity}
                                                </div>
                                            </div>
                                            {serialNumbers && (
                                                <div className="mt-2 ml-11 text-xs text-green-400 bg-green-500/10 p-2 rounded-lg border border-green-500/20">
                                                    <span className="font-semibold">เลขครุภัณฑ์:</span> {serialNumbers}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}


                {filteredTransactions.length === 0 && (
                    <div className="text-center py-20">
                        <div className="glass-card max-w-md mx-auto p-10 backdrop-blur-2xl">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-gray-500/20 to-gray-500/10 flex items-center justify-center">
                                <History className="h-10 w-10 text-gray-400" />
                            </div>
                            <h2 className=" " style={{ color: "var(--text-primary)" }}>ไม่พบประวัติการเบิกจ่าย</h2>
                            <p className="text-gray-400">ลองเปลี่ยนเงื่อนไขการค้นหา หรือช่วงวันที่</p>
                        </div>
                    </div>
                )}
            </div >
        </div >
    );
};

export default Transactions;
