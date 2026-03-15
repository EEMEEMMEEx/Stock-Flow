import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { Search, Package, Plus, Grid, List, AlertCircle, ShoppingCart, Upload, Warehouse } from 'lucide-react';
import ProductFormModal from '../components/ProductFormModal';
import ProductDetailsModal from '../components/ProductDetailsModal';
import { useStore } from '../store/useStore';
import Papa from 'papaparse';
import { generateProductsImportReportPDF } from '../utils/pdfGenerator';

const ProductCatalog = () => {
    // Data State
    const [products, setProducts] = useState([]);
    const [allProductsCache, setAllProductsCache] = useState([]); // Cache for client-side filtering
    const [loading, setLoading] = useState(false);
    const [warehousesMap, setWarehousesMap] = useState({});

    // Pagination State
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const ITEMS_PER_PAGE = 20;

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [categories, setCategories] = useState(['All']);

    // Warehouse State
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('All');

    // View State
    const [viewMode, setViewMode] = useState('grid');

    // CRUD & Modal State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const fileInputRef = useRef(null);
    const initialLoadRef = useRef(true);

    const { user, addToCart } = useStore();
    // Admin only can manage products (Add, Edit, Import)
    const canManage = user?.role === 'admin';
    // Admin and Staff can operate (Add to Cart)
    const canOperate = user?.role === 'admin' || user?.role === 'staff';

    // Fetch Warehouses and build map
    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const q = query(collection(db, 'warehouses'), where('is_active', '==', true));
                const snapshot = await getDocs(q);
                const whData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setWarehouses(whData);

                // Build map for quick lookups
                const map = {};
                whData.forEach(wh => {
                    map[wh.id] = wh;
                });
                setWarehousesMap(map);
            } catch (err) {
                console.error('Error fetching warehouses:', err);
            }
        };
        loadWarehouses();
    }, []);

    const fetchProducts = useCallback(async (pageNumber = page, forceRefresh = false) => {
        try {
            setLoading(true);

            let sourceProducts = allProductsCache;

            // Fetch from server if cache empty or forced
            if (forceRefresh || sourceProducts.length === 0) {
                const q = query(collection(db, 'products'), orderBy('name'));
                const snapshot = await getDocs(q);
                sourceProducts = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // Manually join warehouse info
                    const wh = warehousesMap[data.warehouse_id];
                    return {
                        id: doc.id,
                        ...data,
                        warehouses: wh ? { name: wh.name, code: wh.code } : null
                    };
                });
                setAllProductsCache(sourceProducts);

                // Update categories based on fresh data
                const uniqueCategories = ['All', ...new Set(sourceProducts.map(p => p.category).filter(Boolean))];
                setCategories(uniqueCategories);
            }

            // Client-side Filtering
            let filtered = [...sourceProducts];

            if (searchTerm) {
                const lowerTerm = searchTerm.toLowerCase();
                filtered = filtered.filter(p =>
                    (p.name && p.name.toLowerCase().includes(lowerTerm)) ||
                    (p.sku && p.sku.toLowerCase().includes(lowerTerm))
                );
            }

            if (selectedCategory !== 'All') {
                filtered = filtered.filter(p => p.category === selectedCategory);
            }

            if (selectedWarehouse !== 'All') {
                filtered = filtered.filter(p => p.warehouse_id === selectedWarehouse);
            }

            setTotalCount(filtered.length);

            // Pagination
            const from = pageNumber * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE;
            const pagedData = filtered.slice(from, to);

            setProducts(pagedData);

        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, selectedCategory, selectedWarehouse, page, allProductsCache, warehousesMap]);

    // Derived Data for Modal
    const locations = [...new Set(allProductsCache.map(p => p.location).filter(Boolean))];

    // Initial Load
    useEffect(() => {
        // Just trigger fetch, caching logic handles the rest
        if (warehouses.length > 0 || !loading) { // wait for warehouses potential load or just go
            fetchProducts(0);
        }
    }, []);

    // Filter Change Effect
    useEffect(() => {
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            return;
        }
        setPage(0);
        const timeoutId = setTimeout(() => {
            fetchProducts(0);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, selectedCategory, selectedWarehouse]); // Trigger re-filter

    // Page Change
    useEffect(() => {
        // Logic inside fetchProducts handles slicing based on 'page' state
        // We just re-run filtering/slicing when page changes
        fetchProducts(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [page]);


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
                const importedProducts = [];

                setLoading(true);

                for (const row of rows) {
                    const normalizedRow = {};
                    Object.keys(row).forEach(key => {
                        // Normalize key: lowercase, trim, remove spaces and underscores
                        const normalizedKey = key.toLowerCase().trim().replace(/[\s_]/g, '');
                        normalizedRow[normalizedKey] = row[key];
                    });

                    // Required fields (with more flexible matching)
                    let name = normalizedRow['name'] || normalizedRow['productname'] || normalizedRow['ชื่ออุปกรณ์'];
                    let sku = normalizedRow['sku'] || normalizedRow['code'] || normalizedRow['รหัส'];

                    // Validation & Fallback for missing SKU
                    if (!name) {
                        errorCount++;
                        errors.push(`Row missing Name: ${JSON.stringify(row)}`);
                        continue;
                    }

                    if (!sku) {
                        // Generate a pseudo-SKU based on name hash if missing
                        // This allows re-importing same file to map to same record
                        const nameHash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(16).toUpperCase();
                        sku = `GEN-${nameHash}`;
                        console.log(`Auto-generated SKU ${sku} for "${name}"`);
                    }

                    // Optional fields (normalized keys)
                    const category = normalizedRow['category'] || normalizedRow['หมวดหมู่'] || 'Uncategorized';
                    const location = normalizedRow['location'] || normalizedRow['ที่เก็บ'] || '-';
                    const quantity = parseInt(normalizedRow['quantity'] || normalizedRow['qty'] || normalizedRow['จำนวน'] || '0');
                    const minThreshold = parseInt(normalizedRow['minthreshold'] || normalizedRow['min'] || normalizedRow['ขั้นต่ำ'] || '5');
                    const description = normalizedRow['description'] || normalizedRow['รายละเอียด'] || '';

                    try {
                        // Check if product exists by SKU
                        const q = query(collection(db, 'products'), where('sku', '==', sku));
                        const snapshot = await getDocs(q);
                        const existingDoc = snapshot.empty ? null : snapshot.docs[0];

                        if (existingDoc) {
                            // Update
                            await updateDoc(doc(db, 'products', existingDoc.id), {
                                name,
                                category,
                                location,
                                quantity,
                                min_threshold: minThreshold,
                                description
                            });
                        } else {
                            // Insert
                            await addDoc(collection(db, 'products'), {
                                name,
                                sku,
                                category,
                                location,
                                quantity,
                                min_threshold: minThreshold,
                                description,
                                created_at: new Date().toISOString()
                            });
                        }
                        successCount++;
                        importedProducts.push({ name, sku, category, quantity });

                    } catch (err) {
                        errorCount++;
                        errors.push(`Error saving ${sku}: ${err.message}`);
                    }
                }

                // Refresh current view
                fetchProducts(0, true);
                setLoading(false);

                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }

                // Report
                if (successCount > 0) {
                    await generateProductsImportReportPDF(importedProducts, successCount, errorCount, errors);
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
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleAddProduct = () => {
        setEditingProduct(null);
        setIsFormOpen(true);
    };

    const handleSaveProduct = async (formData) => {
        try {
            if (editingProduct) {
                const productRef = doc(db, 'products', editingProduct.id);
                await updateDoc(productRef, formData);
                fetchProducts(page, true);
            } else {
                await addDoc(collection(db, 'products'), {
                    ...formData,
                    created_at: new Date().toISOString()
                });
                fetchProducts(0, true);
            }
        } catch (error) {
            console.error('Error saving product:', error);
            throw error;
        }
    };

    const handleAddToCart = (product) => {
        if (product.quantity <= 0) return;
        addToCart(product);
    };

    const getStockColor = (product) => {
        if (product.quantity === 0) return 'text-red-400';
        if (product.quantity <= product.min_threshold) return 'text-yellow-400';
        return 'text-green-400';
    };

    const getStockBgColor = (product) => {
        if (product.quantity === 0) return 'bg-red-500/20';
        if (product.quantity <= product.min_threshold) return 'bg-yellow-500/20';
        return 'bg-green-500/20';
    };

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#1C6CB4]/20 rounded-xl">
                        <Package className="text-[#1C6CB4]" size={28} />
                    </div>
                    <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>รายการอุปกรณ์</h1>
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
                                title="Import CSV: SKU, Name, Category, Location, Quantity, Min Threshold"
                            >
                                <Upload size={20} />
                                นำเข้า CSV
                            </button>
                            <button
                                onClick={handleAddProduct}
                                className="btn-blue flex items-center gap-2 w-full sm:w-auto justify-center"
                            >
                                <Plus size={20} />
                                เพิ่มอุปกรณ์
                            </button>
                        </>
                    )}

                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="ค้นหาอุปกรณ์..."
                            className="glass-input pl-12 w-full sm:w-80"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 flex flex-col md:flex-row gap-4 items-center justify-between backdrop-blur-2xl border border-white/10 shadow-xl shadow-[#1C6CB4]/5">
                <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${selectedCategory === cat
                                ? 'bg-gradient-to-r from-[#1C6CB4] to-[#2a7dc4] text-white shadow-lg shadow-[#1C6CB4]/30'
                                : 'bg-white/5 hover:bg-white/10'
                                }`}
                            style={{ color: selectedCategory !== cat ? 'var(--text-primary)' : undefined }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    {/* Warehouse Filter */}
                    {warehouses.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Warehouse size={18} className="text-gray-400" />
                            <select
                                value={selectedWarehouse}
                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                                className="glass-select text-sm py-2"
                            >
                                <option value="All">ทุกคลัง</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>
                                        [{wh.code}] {wh.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-[#1C6CB4]/30 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Grid size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[#1C6CB4]/30 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <List size={20} />
                        </button>
                    </div>
                </div>
            </div>
            {loading && products.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                    <div className="glass-card max-w-md mx-auto p-10 backdrop-blur-2xl text-center">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#1C6CB4]/20 to-blue-500/10 flex items-center justify-center shadow-lg shadow-[#1C6CB4]/20 animate-pulse">
                            <div className="w-12 h-12 border-4 border-[#1C6CB4] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>กำลังโหลดอุปกรณ์</h2>
                        <p style={{ color: 'var(--text-muted)' }}>กรุณารอสักครู่...</p>
                        <div className="mt-4 flex justify-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#1C6CB4] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-[#1C6CB4] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-[#1C6CB4] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                </div>
            ) : products.length === 0 ? (
                <div className="glass-card p-16 flex flex-col items-center justify-center text-center backdrop-blur-2xl">
                    <div className="w-24 h-24 bg-gradient-to-br from-gray-500/20 to-gray-500/10 rounded-full flex items-center justify-center mb-6 shadow-lg">
                        <Package className="text-gray-400" size={48} />
                    </div>
                    <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>ไม่พบอุปกรณ์</h3>
                    <p style={{ color: 'var(--text-muted)' }} className="max-w-sm">ลองค้นหาด้วยคำค้นอื่น หรือเพิ่มอุปกรณ์ใหม่</p>
                </div>
            ) : (
                <>
                    {/* Grid View */}
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className="glass-card overflow-hidden group hover:bg-white/15 transition-all duration-300 cursor-pointer border-l-4 border-transparent hover:border-l-[#1C6CB4] hover:shadow-xl hover:shadow-[#1C6CB4]/10"
                                    onClick={() => setSelectedProduct(product)}
                                >
                                    {/* Product Image */}
                                    <div className="h-40 bg-white/5 relative overflow-hidden">
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Package className="text-gray-600" size={48} />
                                            </div>
                                        )}

                                        {/* Stock Badge */}
                                        <div className={`absolute top-3 right-3 px-2 py-1 rounded-lg text-xs font-semibold ${getStockBgColor(product)} ${getStockColor(product)}`}>
                                            {product.quantity === 0 ? 'หมด' : `${product.quantity} ชิ้น`}
                                        </div>

                                        {/* Low Stock Warning */}
                                        {product.quantity > 0 && product.quantity <= product.min_threshold && (
                                            <div className="absolute top-3 left-3 p-1.5 bg-yellow-500/20 rounded-lg">
                                                <AlertCircle className="text-yellow-400" size={16} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-4">
                                        <p className="text-xs text-gray-500 mb-1">{product.sku}</p>
                                        <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-[#1C6CB4] transition-colors" style={{ color: 'var(--text-primary)' }}>
                                            {product.name}
                                        </h3>

                                        {product.category && (
                                            <span className="inline-block px-2 py-0.5 bg-[#1C6CB4]/20 text-[#5ca0dc] text-xs rounded-full mb-3">
                                                {product.category}
                                            </span>
                                        )}

                                        {canOperate && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToCart(product);
                                                }}
                                                disabled={product.quantity === 0}
                                                className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:shadow-lg hover:shadow-green-500/20 hover:scale-[1.02] flex items-center justify-center gap-2"
                                            >
                                                <ShoppingCart size={16} />
                                                เพิ่มลงตะกร้า
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* List View */
                        <div className="glass-table">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="px-4 py-3 text-left">รหัส</th>
                                        <th className="px-4 py-3 text-left">ชื่ออุปกรณ์</th>
                                        <th className="px-4 py-3 text-left">หมวดหมู่</th>
                                        <th className="px-4 py-3 text-center">คงเหลือ</th>
                                        <th className="px-4 py-3 text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((product) => (
                                        <tr
                                            key={product.id}
                                            className="hover:bg-white/5 cursor-pointer transition-all duration-300 border-l-4 border-transparent hover:border-l-[#1C6CB4]"
                                            onClick={() => setSelectedProduct(product)}
                                        >
                                            <td className="px-4 py-3 font-mono text-sm text-gray-400">{product.sku}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                                                            <Package className="text-gray-500" size={20} />
                                                        </div>
                                                    )}
                                                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{product.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-400">{product.category || '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-lg text-sm font-medium ${getStockBgColor(product)} ${getStockColor(product)}`}>
                                                    {product.quantity}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {canOperate && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAddToCart(product);
                                                        }}
                                                        disabled={product.quantity === 0}
                                                        className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-all duration-300 disabled:opacity-50 hover:shadow-lg hover:shadow-green-500/20 hover:scale-110"
                                                    >
                                                        <ShoppingCart size={18} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-8 pb-8 border-t border-white/10 pt-6">
                        <div className="text-sm text-gray-400">
                            แสดง {page * ITEMS_PER_PAGE + 1}-{Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} จาก {totalCount} รายการ
                        </div>

                        <div className="flex justify-center items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                            >
                                ก่อนหน้า
                            </button>

                            {/* Page Numbers Logic */}
                            {Array.from({ length: totalPages }).map((_, i) => {
                                // Logic: Show first, last, current, and +/- 1 around current
                                // If many pages, use ellipsis
                                const shouldShow =
                                    totalPages <= 7 ||
                                    i === 0 ||
                                    i === totalPages - 1 ||
                                    (i >= page - 1 && i <= page + 1);

                                if (shouldShow) {
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setPage(i)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${page === i
                                                ? 'bg-[#1C6CB4] text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            {i + 1}
                                        </button>
                                    );
                                } else if (
                                    (i === 1 && page > 3) ||
                                    (i === totalPages - 2 && page < totalPages - 4)
                                ) {
                                    // Show ellipsis only once per side
                                    // Simple logic to debounce ellipsis
                                    if (i === 1 || i === totalPages - 2) return <span key={i} className="text-gray-500">...</span>;
                                    return null;
                                }
                                return null;
                            })}

                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                            >
                                ถัดไป
                            </button>
                        </div>
                    </div>
                </>
            )
            }

            {/* Product Form Modal */}
            <ProductFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleSaveProduct}
                product={editingProduct}
                categories={categories}
                locations={locations}
            />

            {/* Product Details Modal */}
            {
                selectedProduct && (
                    <ProductDetailsModal
                        product={selectedProduct}
                        onClose={() => setSelectedProduct(null)}
                        onAddToCart={handleAddToCart}
                    />
                )
            }
        </div >
    );
};

export default ProductCatalog;
