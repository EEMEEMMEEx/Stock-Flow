import React, { useState, useEffect, useCallback } from 'react';
import {
    Warehouse, Plus, Search, Edit, Trash2, MapPin, Phone, User,
    CheckCircle, XCircle, RefreshCw, ArrowRightLeft, Package
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, getCountFromServer } from 'firebase/firestore';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import WarehouseFormModal from '../components/WarehouseFormModal';
import TransferModal from '../components/TransferModal';
import { useStore } from '../store/useStore';

const Warehouses = () => {
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFormModal, setShowFormModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [warehouseStats, setWarehouseStats] = useState({});

    const { user } = useStore();
    const isAdmin = user?.role === 'admin';

    const fetchWarehouses = useCallback(async () => {
        try {
            setLoading(true);

            // Fetch warehouses
            const warehousesRef = collection(db, 'warehouses');
            const q = query(warehousesRef, orderBy('created_at', 'asc')); // Ensure 'created_at' exists in your documents
            const querySnapshot = await getDocs(q);

            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // If no warehouses data, use sample data (Optional: Remove in production)
            if (data.length === 0) {
                // Sample data handled below if needed, or just empty array
            }

            setWarehouses(data);

            // Fetch stats for each warehouse
            const stats = {};
            for (const wh of data) {
                // Count products
                const productsRef = collection(db, 'products');
                const productsQuery = query(productsRef, where('warehouse_id', '==', wh.id));
                const productSnapshot = await getCountFromServer(productsQuery);

                // Count assets
                const assetsRef = collection(db, 'assets');
                const assetsQuery = query(assetsRef, where('warehouse_id', '==', wh.id));
                const assetSnapshot = await getCountFromServer(assetsQuery);

                stats[wh.id] = {
                    products: productSnapshot.data().count || 0,
                    assets: assetSnapshot.data().count || 0
                };
            }
            setWarehouseStats(stats);

        } catch (err) {
            console.error('Error fetching warehouses:', err);
            // Don't show sample data on error if we want to be strict, or show toast
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWarehouses();
    }, [fetchWarehouses]);

    const handleAddWarehouse = () => {
        setSelectedWarehouse(null);
        setShowFormModal(true);
    };

    const handleEditWarehouse = (warehouse) => {
        setSelectedWarehouse(warehouse);
        setShowFormModal(true);
    };

    const handleDeleteWarehouse = async (warehouse) => {
        if (!confirm(`ยืนยันลบคลัง "${warehouse.name}"?`)) return;

        try {
            await deleteDoc(doc(db, 'warehouses', warehouse.id));
            fetchWarehouses();
        } catch (err) {
            alert('ไม่สามารถลบคลังได้: ' + err.message);
        }
    };

    const handleSaveWarehouse = async (data) => {
        try {
            if (selectedWarehouse) {
                // Update
                const warehouseRef = doc(db, 'warehouses', selectedWarehouse.id);
                await updateDoc(warehouseRef, data);
            } else {
                // Create
                await addDoc(collection(db, 'warehouses'), {
                    ...data,
                    created_at: new Date().toISOString(),
                    is_active: true
                });
            }
            setShowFormModal(false);
            fetchWarehouses();
        } catch (err) {
            throw err;
        }
    };

    const filteredWarehouses = warehouses.filter(wh =>
        wh.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wh.address && wh.address.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-100 rounded-xl">
                        <Warehouse className="text-indigo-600" size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            คลังสินค้า
                        </h1>
                        <p className="text-sm text-gray-500">{warehouses.length} สาขา/คลัง</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowTransferModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-colors"
                    >
                        <ArrowRightLeft size={18} />
                        <span className="hidden sm:inline">โอนย้าย</span>
                    </button>
                    {isAdmin && (
                        <button
                            onClick={handleAddWarehouse}
                            className="flex items-center gap-2 px-4 py-2.5 btn-gradient"
                        >
                            <Plus size={18} />
                            <span className="hidden sm:inline">เพิ่มคลัง</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Search */}
            <div className="glass-card p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="ค้นหาคลัง..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="glass-input pl-12 w-full"
                    />
                </div>
            </div>

            {/* Warehouses Grid */}
            {loading ? (
                <LoadingSpinner message="กำลังโหลดข้อมูลคลัง..." />
            ) : filteredWarehouses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredWarehouses.map(warehouse => (
                        <div
                            key={warehouse.id}
                            className="glass-card p-6 hover:shadow-lg transition-all duration-300"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-xl ${warehouse.is_active ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                        <Warehouse className={warehouse.is_active ? 'text-indigo-600' : 'text-gray-400'} size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                                            {warehouse.name}
                                        </h3>
                                        <span className="text-sm text-gray-500 font-mono">{warehouse.code}</span>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${warehouse.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {warehouse.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {warehouse.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                </span>
                            </div>

                            {/* Info */}
                            <div className="space-y-2 mb-4">
                                {warehouse.address && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <MapPin size={14} />
                                        <span>{warehouse.address}</span>
                                    </div>
                                )}
                                {warehouse.phone && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <Phone size={14} />
                                        <span>{warehouse.phone}</span>
                                    </div>
                                )}
                                {warehouse.manager_name && (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <User size={14} />
                                        <span>{warehouse.manager_name}</span>
                                    </div>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl mb-4">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-indigo-600">
                                        {warehouseStats[warehouse.id]?.products || 0}
                                    </p>
                                    <p className="text-xs text-gray-500">อุปกรณ์</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-orange-500">
                                        {warehouseStats[warehouse.id]?.assets || 0}
                                    </p>
                                    <p className="text-xs text-gray-500">ครุภัณฑ์</p>
                                </div>
                            </div>

                            {/* Actions */}
                            {isAdmin && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEditWarehouse(warehouse)}
                                        className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1 text-sm"
                                    >
                                        <Edit size={14} />
                                        แก้ไข
                                    </button>
                                    <button
                                        onClick={() => handleDeleteWarehouse(warehouse)}
                                        className="py-2 px-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Warehouse}
                    title="ไม่พบคลังสินค้า"
                    description="ยังไม่มีข้อมูลคลังในระบบ"
                    actionLabel="เพิ่มคลัง"
                    onAction={handleAddWarehouse}
                />
            )}

            {/* Modals */}
            {showFormModal && (
                <WarehouseFormModal
                    isOpen={showFormModal}
                    onClose={() => setShowFormModal(false)}
                    onSave={handleSaveWarehouse}
                    warehouse={selectedWarehouse}
                />
            )}

            {showTransferModal && (
                <TransferModal
                    isOpen={showTransferModal}
                    onClose={() => setShowTransferModal(false)}
                    warehouses={warehouses.filter(w => w.is_active)}
                    onComplete={fetchWarehouses}
                />
            )}
        </div>
    );
};

export default Warehouses;
