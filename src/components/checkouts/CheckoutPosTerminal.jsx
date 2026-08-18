import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Package, Search, Building2, User, Phone, 
  Calendar, Layers, Plus, Minus, Trash2, Clock, CheckCircle2, 
  AlertCircle, Sparkles, Send, ArrowRight, Tag, Hash, 
  ClipboardPaste, Barcode, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';

const CheckoutPosTerminal = ({
  projects = [],
  items = [],
  rawBalances = [],
  onCheckoutSuccess
}) => {
  const { profile } = useAuth();
  
  // Selected source project
  const [selectedProjectId, setSelectedProjectId] = useState('');
  
  // Borrower Info Form
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerDepartment, setBorrowerDepartment] = useState('');
  
  // Today + 7 days default expected return date
  const defaultDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);
  const [expectedReturnDate, setExpectedReturnDate] = useState(defaultDueDate);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  // Cart for items being checked out
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Active batch paste input states per item: { [itemId]: string }
  const [batchInputText, setBatchInputText] = useState({});
  const [showBatchInput, setShowBatchInput] = useState({});

  // Group projects logically
  const groupedProjects = useMemo(() => {
    const map = new Map();
    projects.forEach(p => {
      const key = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
      if (!map.has(key)) {
        map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
      } else {
        map.get(key).locations.push(p);
      }
    });
    return Array.from(map.values());
  }, [projects]);

  // Available items in the selected project location
  const availableItems = useMemo(() => {
    if (!selectedProjectId) return [];
    
    return items.map(item => {
      const b = (rawBalances || []).find(
        r => r.project_id === selectedProjectId && r.item_id === item.id
      );
      const balance = b ? (Number(b.balance) || 0) : 0;
      return {
        ...item,
        availableStock: balance
      };
    }).filter(i => i.availableStock > 0);
  }, [items, rawBalances, selectedProjectId]);

  // Filter available items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems.slice(0, 16);
    const q = searchQuery.toLowerCase();
    return availableItems.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [availableItems, searchQuery]);

  // Add item to cart
  const handleAddToCart = (item) => {
    const existing = cart.find(c => c.item_id === item.id);
    if (existing) {
      if (existing.quantity >= item.availableStock) {
        toast.error(`ไม่สามารถยืมเกินสต็อกที่มีได้ (${item.availableStock} ${item.unit || 'ชิ้น'})`);
        return;
      }
      handleUpdateQuantity(item.id, existing.quantity + 1);
    } else {
      setCart(prev => [
        ...prev,
        {
          item_id: item.id,
          item_name: item.name,
          sku: item.sku,
          model: item.model,
          unit: item.unit || 'ชิ้น',
          quantity: 1,
          availableStock: item.availableStock,
          serial_numbers: [''], // Array with length matching quantity
          condition: 'normal',
          notes: ''
        }
      ]);
    }
  };

  // Update item quantity and sync serial_numbers array length
  const handleUpdateQuantity = (itemId, newQty) => {
    const parsedQty = Math.max(1, parseInt(newQty) || 1);
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      const cappedQty = Math.min(parsedQty, item.availableStock);
      const existingSNs = Array.isArray(item.serial_numbers) 
        ? item.serial_numbers 
        : (item.serial_number ? [item.serial_number] : ['']);
      
      const newSNs = Array.from({ length: cappedQty }, (_, idx) => existingSNs[idx] || '');
      
      return {
        ...item,
        quantity: cappedQty,
        serial_numbers: newSNs
      };
    }));
  };

  // Update a single serial number slot
  const handleUpdateItemSN = (itemId, index, value) => {
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      const sns = [...(item.serial_numbers || [])];
      sns[index] = value;
      return { ...item, serial_numbers: sns };
    }));
  };

  // Quick Batch Paste / Scan Multi-SN helper
  const handleApplyBatchSN = (itemId) => {
    const rawText = batchInputText[itemId] || '';
    if (!rawText.trim()) return;

    const parts = rawText
      .split(/[\r\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      // Auto expand quantity if pasted SNs count exceeds current quantity
      const targetQty = Math.min(Math.max(item.quantity, parts.length), item.availableStock);
      const newSNs = Array.from({ length: targetQty }, (_, idx) => parts[idx] || (item.serial_numbers && item.serial_numbers[idx]) || '');

      return {
        ...item,
        quantity: targetQty,
        serial_numbers: newSNs
      };
    }));

    toast.success(`นำเข้า Serial Number จำนวน ${parts.length} รายการ`);
    setBatchInputText(prev => ({ ...prev, [itemId]: '' }));
    setShowBatchInput(prev => ({ ...prev, [itemId]: false }));
  };

  // Clear all Serial Numbers for an item
  const handleClearItemSNs = (itemId) => {
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      return {
        ...item,
        serial_numbers: Array.from({ length: item.quantity }, () => '')
      };
    }));
    toast.success('ล้าง Serial Number เรียบร้อย');
  };

  const handleUpdateCartItem = (itemId, field, val) => {
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      return { ...item, [field]: val };
    }));
  };

  const handleRemoveFromCart = (itemId) => {
    setCart(prev => prev.filter(c => c.item_id !== itemId));
  };

  const totalUnits = cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  // Submit checkout order
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) {
      return toast.error('กรุณาเลือกคลัง/โครงการต้นทาง');
    }
    if (!borrowerName.trim()) {
      return toast.error('กรุณาระบุชื่อผู้ยืมพัสดุ');
    }
    if (!expectedReturnDate) {
      return toast.error('กรุณาระบุกำหนดวันส่งคืน');
    }
    if (cart.length === 0) {
      return toast.error('กรุณาเลือกรายการอุปกรณ์ที่ต้องการยืมอย่างน้อย 1 รายการ');
    }

    // Verify stock availability
    for (const item of cart) {
      if (Number(item.quantity) <= 0) {
        return toast.error(`จำนวนที่ยืมของ "${item.item_name}" ต้องมากกว่า 0`);
      }
      if (Number(item.quantity) > item.availableStock) {
        return toast.error(`จำนวนที่ยืมของ "${item.item_name}" เกินสต็อกที่มี (${item.availableStock})`);
      }
    }

    try {
      setSubmitting(true);

      // Expand items with multi-SN into distinct line items, or single row if no SNs
      const expandedItems = [];
      for (const item of cart) {
        const sns = (item.serial_numbers || []).map(s => s.trim());
        const hasAnySN = sns.some(Boolean);
        const qty = Number(item.quantity);

        if (hasAnySN) {
          // If individual SNs are specified, create 1 line item per unit for serialized custody & audit
          for (let i = 0; i < qty; i++) {
            expandedItems.push({
              item_id: item.item_id,
              quantity: 1,
              serial_number: sns[i] || null,
              condition: item.condition || 'normal',
              notes: item.notes?.trim() || null
            });
          }
        } else {
          // Bulk consumable / non-serialized items
          expandedItems.push({
            item_id: item.item_id,
            quantity: qty,
            serial_number: null,
            condition: item.condition || 'normal',
            notes: item.notes?.trim() || null
          });
        }
      }

      const payload = {
        project_id: selectedProjectId,
        borrower_name: borrowerName.trim(),
        borrower_phone: borrowerPhone.trim() || null,
        borrower_department: borrowerDepartment.trim() || null,
        expected_return_date: expectedReturnDate,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
        created_by: profile?.id || null,
        items: expandedItems
      };

      const { data, error } = await supabase.rpc('process_checkout_order', {
        p_payload: payload
      });

      if (error) throw error;

      toast.success(`สร้างคำสั่งยืม ${data.order_number || ''} สำเร็จเรียบร้อย`);
      setCart([]);
      setBorrowerName('');
      setBorrowerPhone('');
      setBorrowerDepartment('');
      setPurpose('');
      setNotes('');
      setBatchInputText({});
      setShowBatchInput({});
      if (onCheckoutSuccess) onCheckoutSuccess(data);
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการทำรายการยืม');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleCheckoutSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Project Location & Item Selection (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Step 1: Project & Location Picker */}
          <Card className="rounded-3xl glass border border-border/80 shadow-md">
            <CardHeader className="border-b border-border/40 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <span>1. เลือกโครงการและคลังต้นทาง (Source Project & Storage Location)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <ProjectLocationSelector
                projects={projects}
                value={selectedProjectId}
                onChange={(id) => {
                  setSelectedProjectId(id);
                  setCart([]); // Clear cart when project changes
                }}
                required={true}
                mode="dual"
                label="โครงการและคลังต้นทางสำหรับยืมอุปกรณ์"
                showSummaryCard={false}
              />

              {selectedProjectId && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-indigo-500/5 dark:bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-500/20">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>มีอุปกรณ์พร้อมให้ยืมในคลังนี้:</span>
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {availableItems.length} รายการ
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Item Catalog Search & Add */}
          <Card className="rounded-3xl glass border border-border/80 shadow-md">
            <CardHeader className="border-b border-border/40 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Package className="w-4 h-4" />
                </div>
                <span>2. เลือกอุปกรณ์ / วัสดุที่ต้องการยืม</span>
              </CardTitle>

              {/* Search Bar */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาชื่อ, SKU, Model..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={!selectedProjectId}
                  className="pl-8 h-9 text-xs rounded-xl"
                />
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {!selectedProjectId ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1 bg-muted/20 rounded-2xl border border-dashed border-border/60">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
                  <p className="font-semibold text-foreground">กรุณาเลือกคลัง/โครงการต้นทางก่อน</p>
                  <p className="text-[11px]">เพื่อโหลดรายการอุปกรณ์ที่มีสต็อกคงเหลือพร้อมให้ยืม</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1 bg-muted/20 rounded-2xl border border-dashed border-border/60">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
                  <p className="font-semibold text-foreground">ไม่พบรายการอุปกรณ์ในคลังนี้</p>
                  <p className="text-[11px]">หรือสต็อกคงเหลือในคลังนี้เป็น 0</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {filteredItems.map(item => {
                    const cartItem = cart.find(c => c.item_id === item.id);
                    const isAdded = Boolean(cartItem);

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleAddToCart(item)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                          isAdded 
                            ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30' 
                            : 'bg-card/70 hover:bg-accent/40 border-border/70 hover:border-indigo-500/30'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-bold text-xs text-foreground line-clamp-2 leading-tight">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            {item.sku && <span>SKU: {item.sku}</span>}
                            {item.model && <span>• {item.model}</span>}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            คงเหลือ: {item.availableStock} {item.unit || 'ชิ้น'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                            isAdded 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-muted text-muted-foreground hover:bg-indigo-500 hover:text-white'
                          }`}>
                            <Plus className="w-3 h-3" />
                            {isAdded ? `เลือกแล้ว (${cartItem.quantity})` : 'เพิ่ม'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checkout Details & Cart (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Step 3: Borrower & Due Date Form */}
          <div className="neu-flat text-card-foreground rounded-3xl glass border border-border/80 shadow-md">
            <div className="flex flex-col space-y-1.5 p-6 border-b border-border/40 pb-3">
              <h3 className="tracking-tight text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <User className="w-4 h-4" />
                </div>
                <span>3. ข้อมูลผู้ยืมและกำหนดส่งคืน</span>
              </h3>
            </div>
            <div className="p-6 pt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-foreground">ชื่อผู้ยืม / ช่างผู้เบิก <span className="text-destructive">*</span></Label>
                  <Input
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    className="h-10 text-xs rounded-xl neu-pressed"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-foreground">เบอร์โทรติดต่อ</Label>
                  <Input
                    placeholder="เช่น 081-234-5678"
                    value={borrowerPhone}
                    onChange={(e) => setBorrowerPhone(e.target.value)}
                    className="h-10 text-xs rounded-xl neu-pressed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-foreground">แผนก / ทีมงาน</Label>
                  <Input
                    placeholder="เช่น ทีมติดตั้ง DOPA ภาคใต้"
                    value={borrowerDepartment}
                    onChange={(e) => setBorrowerDepartment(e.target.value)}
                    className="h-10 text-xs rounded-xl neu-pressed"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1 text-red-600 dark:text-red-400">
                    <Calendar className="w-3 h-3" />
                    <span>กำหนดส่งคืน <span className="text-destructive">*</span></span>
                  </Label>
                  <Input
                    type="date"
                    required
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="h-10 text-xs rounded-xl font-bold neu-pressed"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">วัตถุประสงค์การยืม / งานที่นำไปใช้</Label>
                <Input
                  placeholder="เช่น ซ่อมบำรุงสถานีฐาน DTRS ภูเก็ต"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="h-10 text-xs rounded-xl neu-pressed"
                />
              </div>
            </div>
          </div>

          {/* Step 4: Checkout Cart & Multi-SN Batch Inputs */}
          <Card className="rounded-3xl glass border border-border/80 shadow-md">
            <CardHeader className="border-b border-border/40 pb-3 flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Layers className="w-4 h-4" />
                </div>
                <span>4. ตะกร้ายืมพัสดุ ({cart.length} รายการ / {totalUnits} ชิ้น)</span>
              </CardTitle>

              {cart.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCart([]);
                    setBatchInputText({});
                    setShowBatchInput({});
                  }}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  ล้างตะกร้า
                </Button>
              )}
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs bg-muted/15 rounded-2xl border border-dashed border-border/60">
                  ยังไม่ได้เลือกรายการอุปกรณ์
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {cart.map((item) => {
                    const sns = item.serial_numbers || [''];
                    const filledSNCount = sns.filter(s => s && s.trim()).length;
                    const isMulti = item.quantity > 1;
                    const isBatchOpen = showBatchInput[item.item_id];

                    return (
                      <div key={item.item_id} className="p-3.5 rounded-2xl bg-card/70 border border-border/80 shadow-xs space-y-3">
                        {/* Item Header & Delete */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-foreground line-clamp-1">{item.item_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                              {item.sku && <span>SKU: {item.sku}</span>}
                              <span>• คงเหลือในคลัง: {item.availableStock} {item.unit}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFromCart(item.item_id)}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg shrink-0 cursor-pointer"
                            title="ลบรายการ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between gap-2 bg-muted/30 p-2 rounded-xl border border-border/40">
                          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5 text-indigo-500" />
                            <span>จำนวนที่ต้องการยืม ({item.unit}):</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={item.quantity <= 1}
                              onClick={() => handleUpdateQuantity(item.item_id, item.quantity - 1)}
                              className="h-7 w-7 rounded-lg text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>

                            <Input
                              type="number"
                              min={1}
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.item_id, e.target.value)}
                              className="h-7 w-16 text-center text-xs font-bold font-mono rounded-lg p-0"
                            />

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={item.quantity >= item.availableStock}
                              onClick={() => handleUpdateQuantity(item.item_id, item.quantity + 1)}
                              className="h-7 w-7 rounded-lg text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Single-SN Input Mode (Quantity = 1) */}
                        {!isMulti ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <Barcode className="w-3 h-3 text-indigo-500" />
                                <span>Serial Number / รหัสเฉพาะ:</span>
                              </Label>
                              {sns[0] && (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                                  ระบุแล้ว
                                </span>
                              )}
                            </div>
                            <Input
                              placeholder="สแกนบาร์โค้ด หรือพิมพ์ S/N..."
                              value={sns[0] || ''}
                              onChange={(e) => handleUpdateItemSN(item.item_id, 0, e.target.value)}
                              className="h-8 text-xs rounded-xl font-mono"
                            />
                          </div>
                        ) : (
                          /* Multi-SN Batch Input Mode (Quantity > 1) */
                          <div className="space-y-2.5 pt-1 border-t border-border/50">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>ระบุ Serial Number ({item.quantity} ชิ้น)</span>
                              </span>

                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                                  filledSNCount === item.quantity
                                    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                    : filledSNCount > 0
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    : 'bg-muted text-muted-foreground border-border/50'
                                }`}>
                                  ระบุแล้ว {filledSNCount}/{item.quantity}
                                </span>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowBatchInput(prev => ({ ...prev, [item.item_id]: !prev[item.item_id] }))}
                                  className="h-6 px-2 text-[10px] font-bold text-indigo-600 hover:bg-indigo-500/10 rounded-lg gap-1 cursor-pointer"
                                  title="เปิด/ปิดกล่องวาง S/N แบบชุด"
                                >
                                  <ClipboardPaste className="w-3 h-3" />
                                  <span>{isBatchOpen ? 'ปิดกล่องวาง' : 'วางชุด (Batch)'}</span>
                                </Button>
                              </div>
                            </div>

                            {/* Batch Paste / Scanner Bar */}
                            {isBatchOpen && (
                              <div className="p-2.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 space-y-2 animate-in fade-in duration-200">
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                    <ClipboardPaste className="w-3 h-3 inline" />
                                    <span>วางหรือสแกน S/N หลายตัว (คั่นด้วย comma หรือ Enter):</span>
                                  </span>
                                  {filledSNCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleClearItemSNs(item.item_id)}
                                      className="text-destructive hover:underline text-[10px]"
                                    >
                                      ล้าง S/N ทั้งหมด
                                    </button>
                                  )}
                                </div>
                                <div className="flex gap-1.5">
                                  <Input
                                    placeholder="เช่น SN001, SN002, SN003..."
                                    value={batchInputText[item.item_id] || ''}
                                    onChange={(e) => setBatchInputText(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleApplyBatchSN(item.item_id);
                                      }
                                    }}
                                    className="h-8 text-xs font-mono rounded-lg flex-1"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleApplyBatchSN(item.item_id)}
                                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg cursor-pointer shrink-0"
                                  >
                                    นำเข้า
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Individual Unit S/N Input Slots */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                              {sns.map((snVal, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-1.5 bg-muted/20 p-1.5 rounded-xl border border-border/40">
                                  <span className="text-[10px] font-bold text-muted-foreground w-12 shrink-0 text-right">
                                    ชิ้นที่ {sIdx + 1}:
                                  </span>
                                  <Input
                                    placeholder={`S/N #${sIdx + 1}`}
                                    value={snVal}
                                    onChange={(e) => handleUpdateItemSN(item.item_id, sIdx, e.target.value)}
                                    className="h-7 text-[11px] rounded-lg font-mono flex-1 p-1.5"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submitting || cart.length === 0 || !selectedProjectId}
                className="w-full h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2 cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'กำลังบันทึก...' : `ยืนยันการทำรายการยืม (${totalUnits} ชิ้น)`}</span>
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </form>
  );
};

export default CheckoutPosTerminal;
