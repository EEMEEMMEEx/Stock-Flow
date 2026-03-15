import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { Search, ScanBarcode, CheckCircle, XCircle, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Box, User, Calendar, Upload, FileText } from 'lucide-react';
import AssetFormModal from '../components/AssetFormModal';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import Papa from 'papaparse';
import { generateAssetsReportPDF, generateAssetsImportReportPDF } from '../utils/pdfGenerator';
import { LoadingSpinner, ErrorDisplay } from '../components/UIStates';

const Assets = () => {
    const [searchParams] = useSearchParams();
    const [assets, setAssets] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Initialize search from URL query parameter (from QR scanner)
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const fileInputRef = useRef(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(12);

    // CRUD State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(null);

    const { user } = useStore();
    const canManage = user?.role === 'admin';

    useEffect(() => {
        fetchData();
    }, []);

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Fetch Products first (for join)
            const pSnapshot = await getDocs(query(collection(db, 'products'), orderBy('name')));
            const productsList = pSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setProducts(productsList);

            // Create map for easy lookup
            const productMap = {};
            productsList.forEach(p => {
                productMap[p.id] = p;
            });

            // 2. Fetch Assets
            const aSnapshot = await getDocs(query(collection(db, 'assets'), orderBy('serial_number')));
            const assetsList = aSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    products: productMap[data.product_id] || { name: 'Unknown', sku: 'N/A' } // Join logic
                };
            });

            setAssets(assetsList);
        } catch (err) {
            console.error('Error fetching assets:', err);
            setError(err.message || 'ไม่สามารถโหลดข้อมูลครุภัณฑ์ได้');
        } finally {
            setLoading(false);
        }
    };

    const handleAddAsset = () => {
        setEditingAsset(null);
        setIsFormOpen(true);
    };

    const handleEditAsset = (asset) => {
        setEditingAsset(asset);
        setIsFormOpen(true);
    };

    const handleDeleteAsset = async (asset) => {
        if (!window.confirm(`คุณแน่ใจหรือไม่ที่จะลบครุภัณฑ์ "${asset.serial_number}"?`)) return;

        try {
            await deleteDoc(doc(db, 'assets', asset.id));
            setAssets(prev => prev.filter(a => a.id !== asset.id));
        } catch (error) {
            console.error('Error deleting asset:', error);
            alert('ไม่สามารถลบครุภัณฑ์ได้');
        }
    };

    const handleSaveAsset = async (formData) => {
        try {
            let savedAsset = null;

            // Look up product name/sku for immediate UI update
            const productDetails = products.find(p => p.id === formData.product_id);

            if (editingAsset) {
                // Update
                const assetRef = doc(db, 'assets', editingAsset.id);
                await updateDoc(assetRef, formData);

                savedAsset = {
                    ...editingAsset,
                    ...formData,
                    products: productDetails || editingAsset.products
                };

                setAssets(prev => prev.map(a => a.id === editingAsset.id ? savedAsset : a));
            } else {
                // Insert
                // Check duplicate SN manually?
                // For now, let's just add.
                const newDocRef = await addDoc(collection(db, 'assets'), formData);

                savedAsset = {
                    id: newDocRef.id,
                    ...formData,
                    products: productDetails || { name: 'Unknown', sku: 'N/A' }
                };

                setAssets(prev => [...prev, savedAsset]);
            }
        } catch (error) {
            console.error('Error saving asset:', error);
            throw error;
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            complete: async (results) => {
                const rows = results.data;
                let successCount = 0;
                let errorCount = 0;
                const errors = [];
                const importedAssets = [];

                setLoading(true);

                // Pre-fetch all assets to check duplicates locally? (More efficient than per-row query if dataset is small)
                // Or query per row. Let's start with local check if we have data, otherwise query.
                // We typically assume 'assets' state is up to date if we just loaded it.
                // But safer to query DB or use 'assets' state.
                const existingSNs = new Set(assets.map(a => a.serial_number.toLowerCase()));

                const batch = writeBatch(db);
                let batchCount = 0;

                // Process rows
                // Note: Firestore batch limit is 500. If CSV > 500, need chunking.
                // For simplicity, assuming < 500 items for now or we just do sequential adds if batch complex.
                // Let's do sequential adds for safer error handling per row, although slower.

                for (const row of rows) {
                    const normalizedRow = {};
                    Object.keys(row).forEach(key => {
                        // Normalize key: lowercase, trim, remove spaces and underscores
                        const normalizedKey = key.toLowerCase().trim().replace(/[\s_]/g, '');
                        normalizedRow[normalizedKey] = row[key];
                    });

                    let serialNumber = normalizedRow['serialnumber'] || normalizedRow['sn'];
                    const productName = normalizedRow['productname'] || normalizedRow['product'] || normalizedRow['name'];

                    if (!productName) {
                        errorCount++;
                        errors.push(`Row missing Product Name: ${JSON.stringify(row)}`);
                        continue;
                    }

                    if (!serialNumber) {
                        // Generate a pseudo-SN based on timestamp and name if missing
                        const prefix = productName.substring(0, 3).toUpperCase();
                        const randomSuffix = Math.random().toString(36).substring(7).toUpperCase();
                        serialNumber = `ASN-${prefix}-${randomSuffix}`;
                        console.log(`Auto-generated SN ${serialNumber} for "${productName}"`);
                    }

                    if (existingSNs.has(serialNumber.toLowerCase())) {
                        errorCount++;
                        errors.push(`Duplicate SN: ${serialNumber}`);
                        continue;
                    }

                    // Find Product
                    const product = products.find(p => p.name.toLowerCase() === productName.toLowerCase().trim());
                    if (!product) {
                        errorCount++;
                        errors.push(`Product not found: "${productName}" (SN: ${serialNumber})`);
                        continue;
                    }

                    // Add to DB
                    try {
                        // Check uniqueness in DB (double check)
                        const q = query(collection(db, 'assets'), where('serial_number', '==', serialNumber));
                        const snapshot = await getDocs(q);
                        if (!snapshot.empty) {
                            errorCount++;
                            errors.push(`Duplicate SN in DB: ${serialNumber}`);
                            continue;
                        }

                        const newAsset = {
                            serial_number: serialNumber,
                            product_id: product.id,
                            status: 'in_stock'
                        };

                        const ref = await addDoc(collection(db, 'assets'), newAsset);

                        successCount++;
                        importedAssets.push({
                            id: ref.id,
                            ...newAsset,
                            products: product
                        });
                        existingSNs.add(serialNumber.toLowerCase()); // Add to local check for next rows

                    } catch (err) {
                        errorCount++;
                        errors.push(`Error saving SN ${serialNumber}: ${err.message}`);
                    }
                }

                // Update state
                if (importedAssets.length > 0) {
                    setAssets(prev => [...prev, ...importedAssets]);
                }

                // Generate Report
                if (successCount > 0) {
                    await generateAssetsImportReportPDF(importedAssets, successCount, errorCount, errors);
                }

                setLoading(false);

                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }

                let message = `นำเข้าสำเร็จ: ${successCount} รายการ\nล้มเหลว: ${errorCount} รายการ`;
                if (successCount > 0) {
                    message += `\n\nระบบได้สร้างรายงานการนำเข้า PDF โดยอัตโนมัติ`;
                }
                if (errorCount > 0) {
                    message += `\n\nตัวอย่างข้อผิดพลาด:\n` + errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n...' : '');
                }
                alert(message);
            },
            error: (error) => {
                console.error("CSV Parse Error:", error);
                alert("เกิดข้อผิดพลาดในการอ่านไฟล์ CSV");
                setLoading(false);
            }
        });
    };

    const triggerFileUpload = () => {
        fileInputRef.current.click();
    };

    const filteredAssets = assets.filter(asset => {
        const searchLower = searchTerm.toLowerCase();
        return (
            asset.serial_number?.toLowerCase().includes(searchLower) ||
            asset.products?.name?.toLowerCase().includes(searchLower) ||
            asset.products?.sku?.toLowerCase().includes(searchLower) ||
            (asset.current_holder && asset.current_holder.toLowerCase().includes(searchLower))
        );
    });

    // Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredAssets.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    if (loading && assets.length === 0) {
        return <LoadingSpinner message="กำลังโหลดรายการครุภัณฑ์..." />;
    }

    if (error && assets.length === 0) {
        return <ErrorDisplay error={error} onRetry={fetchData} title="ไม่สามารถโหลดข้อมูลได้" />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#ED2229]/20 rounded-xl">
                        <ScanBarcode className="text-[#ff6666]" size={28} />
                    </div>
                    <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>รายการครุภัณฑ์</h1>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                    {canManage && (
                        <>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <button
                                onClick={triggerFileUpload}
                                className="btn-blue flex items-center gap-2 w-full sm:w-auto justify-center"
                                title="Import CSV: Serial Number, Product Name"
                            >
                                <Upload size={20} />
                                นำเข้า CSV
                            </button>
                            <button
                                onClick={() => generateAssetsReportPDF(filteredAssets, 'all')}
                                className="btn-blue flex items-center gap-2 w-full sm:w-auto justify-center"
                                title="พิมพ์รายงานครุภัณฑ์"
                            >
                                <FileText size={20} />
                                พิมพ์รายงาน
                            </button>
                            <button
                                onClick={handleAddAsset}
                                className="btn-blue flex items-center gap-2 w-full sm:w-auto justify-center"
                            >
                                <Plus size={20} />
                                เพิ่มครุภัณฑ์
                            </button>
                        </>
                    )}

                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="ค้นหา..."
                            className="glass-input pl-12 w-full sm:w-80"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Asset Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentItems.map((asset) => (
                    <div
                        key={asset.id}
                        className={`glass-card p-6 flex flex-col justify-between relative group hover:bg-white/15 transition-all duration-300 border-t-4 ${asset.status === 'in_stock' ? 'border-t-green-500' : 'border-t-[#ED2229]'
                            }`}
                    >

                        {/* Action Buttons */}
                        {canManage && (
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleEditAsset(asset)}
                                    className="p-2 text-[#5ca0dc] bg-[#1C6CB4]/20 hover:bg-[#1C6CB4]/30 rounded-lg transition-colors"
                                    title="แก้ไข"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    onClick={() => handleDeleteAsset(asset)}
                                    className="p-2 text-[#ff6666] bg-[#ED2229]/20 hover:bg-[#ED2229]/30 rounded-lg transition-colors"
                                    title="ลบ"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}

                        <div>
                            <div className="flex items-center justify-between mb-4 pr-16">
                                <span className={`font-mono text-sm px-2 py-1 rounded-md ${asset.status === 'in_stock' ? 'bg-green-500/10 text-green-400' : 'bg-[#ED2229]/10 text-[#ff6666]'
                                    }`}>
                                    {asset.serial_number}
                                </span>
                            </div>

                            <div className="mb-4">
                                <h3 className="text-xl font-bold mb-1 line-clamp-2" style={{ color: "var(--text-primary)" }}>
                                    {asset.products?.name || 'ไม่ทราบชื่ออุปกรณ์'}
                                </h3>
                                <p className="text-sm text-gray-400 flex items-center gap-2">
                                    <Box size={14} />
                                    {asset.products?.sku}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 mb-4">
                                {asset.status === 'in_stock' ? (
                                    <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg w-full justify-center">
                                        <CheckCircle size={16} />
                                        <span className="font-semibold text-sm">พร้อมใช้งาน</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[#ff6666] bg-[#ED2229]/10 px-3 py-1.5 rounded-lg w-full justify-center">
                                        <XCircle size={16} />
                                        <span className="font-semibold text-sm">{asset.status === 'in_use' ? 'ถูกเบิกไป' : asset.status}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {asset.status !== 'in_stock' && (
                            <div className="pt-4 border-t border-white/10 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <User size={14} />
                                        <span>ผู้ถือครอง:</span>
                                    </div>
                                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{asset.current_holder || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Calendar size={14} />
                                        <span>วันที่เบิก:</span>
                                    </div>
                                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                                        {asset.updated_at ? format(new Date(asset.updated_at), 'dd MMM yy', { locale: th }) : '-'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {asset.status === 'in_stock' && (
                            <div className="pt-4 border-t border-white/10">
                                <p className="text-sm text-center text-gray-500 py-2">
                                    พร้อมสำหรับเบิกจ่าย
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {filteredAssets.length === 0 && !loading && (
                <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <ScanBarcode className="text-gray-500" size={40} />
                    </div>
                    <h3 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>ไม่พบรายการครุภัณฑ์</h3>
                    <p className="text-gray-400">ลองค้นหาด้วยคำค้นอื่น หรือเพิ่มครุภัณฑ์ใหม่</p>
                </div>
            )}

            {/* Pagination Controls */}
            {filteredAssets.length > 0 && (
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-8 pb-8 border-t border-white/10 pt-6">
                    <div className="text-sm text-gray-400">
                        แสดง {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredAssets.length)} จาก {filteredAssets.length} รายการ
                    </div>

                    <div className="flex justify-center items-center gap-2">
                        <button
                            onClick={() => paginate(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            ก่อนหน้า
                        </button>

                        {/* Page Numbers Logic */}
                        {Array.from({ length: totalPages }).map((_, i) => {
                            const pageNumber = i + 1;
                            const shouldShow =
                                totalPages <= 7 ||
                                pageNumber === 1 ||
                                pageNumber === totalPages ||
                                (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1);

                            if (shouldShow) {
                                return (
                                    <button
                                        key={pageNumber}
                                        onClick={() => paginate(pageNumber)}
                                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNumber
                                            ? 'bg-[#1C6CB4] text-white'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                            }`}
                                    >
                                        {pageNumber}
                                    </button>
                                );
                            } else if (
                                (pageNumber === 2 && currentPage > 4) ||
                                (pageNumber === totalPages - 1 && currentPage < totalPages - 3)
                            ) {
                                if (pageNumber === 2 || pageNumber === totalPages - 1) return <span key={pageNumber} className="text-gray-500">...</span>;
                                return null;
                            }
                            return null;
                        })}

                        <button
                            onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            ถัดไป
                        </button>
                    </div>
                </div>
            )}

            <AssetFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleSaveAsset}
                asset={editingAsset}
                products={products}
            />
        </div>
    );
};

export default Assets;
