import React, { useState, useEffect, useMemo } from 'react';
import { X, Upload, Save, Loader, Package, ChevronDown, Warehouse } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const ProductFormModal = ({ isOpen, onClose, onSave, product = null, categories = [], locations = [] }) => {
    const [formData, setFormData] = useState({
        sku: '',
        name: '',
        category: '',
        location: '',
        quantity: 0,
        min_threshold: 5,
        image_url: '',
        note: '',
        warehouse_id: null
    });
    const [warehouses, setWarehouses] = useState([]);
    const [imageFile, setImageFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploadError, setUploadError] = useState('');

    // Memoize filtered categories and locations to prevent infinite re-renders
    const validCategories = useMemo(() => categories.filter(c => c && c !== 'All'), [categories]);
    const validLocations = useMemo(() => locations.filter(l => l), [locations]);

    // Fetch warehouses
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                // Assuming warehouses collection exists
                const q = query(collection(db, 'warehouses'), where('is_active', '==', true));
                const snapshot = await getDocs(q);
                // If query fails (e.g. index missing), fallback to all
                // const snapshot = await getDocs(collection(db, 'warehouses'));

                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setWarehouses(data || []);
            } catch (err) {
                console.error('Error fetching warehouses:', err);
                // Fallback attempt without 'where' if index issue
                try {
                    const snapshot = await getDocs(collection(db, 'warehouses'));
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setWarehouses(data);
                } catch (e) { console.error("Warehouses fetch failed completely", e); }
            }
        };
        if (isOpen) fetchWarehouses();
    }, [isOpen]);

    useEffect(() => {
        if (product) {
            setFormData({
                sku: product.sku || '',
                name: product.name || '',
                category: product.category || '',
                location: product.location || '',
                quantity: product.quantity || 0,
                min_threshold: product.min_threshold || 5,
                image_url: product.image_url || '',
                note: product.note || '',
                warehouse_id: product.warehouse_id || null
            });
            setPreviewUrl(product.image_url || '');
        } else {
            // Reset for new product
            setFormData({
                sku: '',
                name: '',
                category: validCategories[0] || '',
                location: validLocations[0] || '',
                quantity: 0,
                min_threshold: 5,
                image_url: '',
                note: '',
                warehouse_id: warehouses[0]?.id || null
            });
            setPreviewUrl('');
        }
        setImageFile(null);
        setUploadError('');
    }, [product, isOpen, validCategories, validLocations, warehouses]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'quantity' || name === 'min_threshold' ? parseInt(value) || 0 : value
        }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                setUploadError('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)');
                return;
            }
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setUploadError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
                return;
            }
            setUploadError('');
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        try {
            setUploading(true);
            setUploadError('');

            const formDataUpload = new FormData();
            formDataUpload.append('file', imageFile);
            formDataUpload.append('upload_preset', 'gfonscq5'); // Cloudinary Upload Preset
            formDataUpload.append('folder', 'products'); // Optional folder

            const response = await fetch('https://api.cloudinary.com/v1_1/dmurdpztl/image/upload', {
                method: 'POST',
                body: formDataUpload
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Upload failed');
            }

            const data = await response.json();
            return data.secure_url;

        } catch (error) {
            console.error('Error uploading image to Cloudinary:', error);
            setUploadError(`อัปโหลดล้มเหลว: ${error.message}`);
            return formData.image_url; // Fallback to existing logic if needed, but here we return old URL or error
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const imageUrl = await uploadImage();
            const dataToSave = { ...formData, image_url: imageUrl };
            await onSave(dataToSave);
            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center sticky top-0 backdrop-blur-xl z-10" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <h2 className="text-xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                        <div className="p-2 bg-[#1C6CB4]/20 rounded-lg">
                            <Package className="text-[#5ca0dc]" size={20} />
                        </div>
                        {product ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Image Upload */}
                        <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center">
                            <div className="w-36 h-36 mb-4 relative rounded-2xl overflow-hidden border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5 group hover:border-[#1C6CB4]/50 transition-colors">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center">
                                        <Upload className="text-gray-500 mx-auto mb-2" size={32} />
                                        <span className="text-xs text-gray-500">อัปโหลดรูป</span>
                                    </div>
                                )}
                                {uploading && (
                                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                        <Loader className="animate-spin text-[#5ca0dc]" size={32} />
                                    </div>
                                )}
                            </div>
                            <label className="cursor-pointer bg-[#1C6CB4]/20 text-[#5ca0dc] px-5 py-2 rounded-xl hover:bg-[#1C6CB4]/30 transition-colors text-sm font-medium flex items-center gap-2">
                                <Upload size={16} />
                                เลือกรูปภาพ
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                            </label>
                            {uploadError && (
                                <p className="text-[#ff6666] text-sm mt-2">{uploadError}</p>
                            )}
                            <p className="text-gray-500 text-xs mt-2">รองรับ JPG, PNG, GIF (สูงสุด 5MB)</p>
                        </div>

                        {/* SKU */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                รหัสอุปกรณ์ (SKU) <span className="text-[#ED2229]">*</span>
                            </label>
                            <input
                                type="text"
                                name="sku"
                                required
                                value={formData.sku}
                                onChange={handleChange}
                                placeholder="เช่น IT-001"
                                className="glass-input"
                            />
                        </div>

                        {/* Name */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                ชื่ออุปกรณ์ <span className="text-[#ED2229]">*</span>
                            </label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="เช่น MacBook Pro M3"
                                className="glass-input"
                            />
                        </div>

                        {/* Category - Select Dropdown */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                หมวดหมู่
                            </label>
                            <div className="relative">
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    className="glass-select appearance-none cursor-pointer"
                                >
                                    <option value="" className="bg-slate-900 text-gray-400">-- เลือกหมวดหมู่ --</option>
                                    {validCategories.map(c => (
                                        <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">หรือพิมพ์หมวดหมู่ใหม่ด้านล่าง</p>
                            <input
                                type="text"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                placeholder="พิมพ์หมวดหมู่ใหม่..."
                                className="glass-input mt-2"
                            />
                        </div>

                        {/* Location - Select Dropdown */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                สถานที่เก็บ
                            </label>
                            <div className="relative">
                                <select
                                    name="location"
                                    value={formData.location}
                                    onChange={handleChange}
                                    className="glass-select appearance-none cursor-pointer"
                                >
                                    <option value="" className="bg-slate-900 text-gray-400">-- เลือกสถานที่ --</option>
                                    {validLocations.map(l => (
                                        <option key={l} value={l} className="bg-slate-900 text-white">{l}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">หรือพิมพ์สถานที่ใหม่ด้านล่าง</p>
                            <input
                                type="text"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                placeholder="พิมพ์สถานที่ใหม่..."
                                className="glass-input mt-2"
                            />
                        </div>

                        {/* Warehouse - Select Dropdown */}
                        {warehouses.length > 0 && (
                            <div className="group col-span-1 md:col-span-2">
                                <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors flex items-center gap-2">
                                    <Warehouse size={16} className="text-indigo-500" />
                                    คลังสินค้า
                                </label>
                                <div className="relative">
                                    <select
                                        name="warehouse_id"
                                        value={formData.warehouse_id || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, warehouse_id: e.target.value || null }))}
                                        className="glass-select appearance-none cursor-pointer"
                                    >
                                        <option value="" className="bg-slate-900 text-gray-400">-- เลือกคลัง --</option>
                                        {warehouses.map(wh => (
                                            <option key={wh.id} value={wh.id} className="bg-slate-900 text-white">
                                                [{wh.code}] {wh.name}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <ChevronDown size={16} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quantity */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                จำนวนคงเหลือ
                            </label>
                            <input
                                type="number"
                                name="quantity"
                                min="0"
                                value={formData.quantity}
                                onChange={handleChange}
                                className="glass-input"
                            />
                        </div>

                        {/* Min Threshold */}
                        <div className="group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                แจ้งเตือนเมื่อต่ำกว่า
                            </label>
                            <input
                                type="number"
                                name="min_threshold"
                                min="0"
                                value={formData.min_threshold}
                                onChange={handleChange}
                                className="glass-input"
                            />
                        </div>

                        {/* Note */}
                        <div className="col-span-1 md:col-span-2 group">
                            <label className="form-label group-focus-within:text-[#5ca0dc] transition-colors">
                                หมายเหตุ
                            </label>
                            <textarea
                                name="note"
                                rows="3"
                                value={formData.note}
                                onChange={handleChange}
                                placeholder="รายละเอียดเพิ่มเติม..."
                                className="glass-input resize-none"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={saving || uploading}
                            className="btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {saving ? <Loader className="animate-spin" size={18} /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
                            <span>บันทึกข้อมูล</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductFormModal;
