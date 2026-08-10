import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowDownToLine, Download, Upload, Plus, Trash2, Check, RefreshCw, Package, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const StockIn = () => {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Data for Selectors & Auto-resolution
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  
  // Create Modal State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ project_id: '' });
  const [lineItems, setLineItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // File Input Ref for CSV Upload
  const fileInputRef = useRef(null);

  // Details Dialog State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch stock in orders
      const { data: oData, error: oError } = await supabase
        .from('stock_in_orders')
        .select('*, projects(name, project_code, location, description), profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (oError && oError.code !== '42P01') throw oError;
      setOrders(oData || []);

      // Fetch active projects with locations & description
      const { data: pData } = await supabase
        .from('projects')
        .select('id, name, project_code, location, description')
        .eq('status', 'active')
        .order('name');
      const { data: iData } = await supabase.from('items').select('id, name, unit, sku, image_url, category_id');

      setProjects(pData || []);
      setItems(iData || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setFormData({ project_id: '' });
    setLineItems([createEmptyRow()]);
    setIsCreateDialogOpen(true);
  };

  const createEmptyRow = (item_type = 'PARENT', parent_sku = '') => ({
    tempId: Date.now() + Math.random(),
    no: null,
    item_type: item_type,
    sku: '',
    parent_sku: parent_sku,
    name: '',
    model: '',
    quantity: 1,
    serial_number: '',
    part_number: '',
    notes: ''
  });

  const handleAddLineItem = (item_type = 'PARENT', parent_sku = '') => {
    setLineItems(prev => [...prev, createEmptyRow(item_type, parent_sku)]);
  };

  const handleRemoveLineItem = (tempId) => {
    setLineItems(prev => prev.filter(item => item.tempId !== tempId));
  };

  const handleUpdateLineItem = (tempId, field, value) => {
    setLineItems(prev => prev.map(row => {
      if (row.tempId !== tempId) return row;
      if (field === 'quantity') {
        const parsed = parseInt(value, 10);
        return { ...row, quantity: isNaN(parsed) ? '' : parsed };
      }
      return { ...row, [field]: value };
    }));
  };

  // Download CSV Template with Parent-Child Canonical Schema (UTF-8 BOM \uFEFF)
  const handleDownloadCsvTemplate = () => {
    const bom = '\uFEFF';
    const csvContent = bom + 
      `No,Item_Type,SKU,Parent_SKU,Item_Name,Model,Quantity,Serial_Number,Part_Number,Remark\n` +
      `7,PARENT,CAB-001,,ตู้ชุดDMO-GW+ขาตั้ง (ตั้งนอกอาคาร),DMO-GW,7,,,ติดตั้งภายนอกอาคาร\n` +
      `8,CHILD,SUP-489,CAB-001,Support ขายึด SC-489,SC-489,2,SN-001,PN-489,ประกอบอยู่ในตู้แล้ว\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'stock_in_canonical_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ดาวน์โหลด CSV Template (Canonical Schema UTF-8 BOM) เรียบร้อย');
  };

  // Direct CSV File Parsing with Deterministic Parent-Child State Machine & Heuristic Fallback
  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = event.target?.result;
        if (typeof text !== 'string') return;

        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.slice(1);
        }

        // State-machine CSV parser handling multi-line quoted fields, escaped quotes (""), CRLF/LF, and UTF-8 BOM
        const parseCSV = (csvText) => {
          let cleanText = csvText;
          if (cleanText.charCodeAt(0) === 0xFEFF) {
            cleanText = cleanText.slice(1);
          }

          const rows = [];
          let currentRow = [];
          let currentField = '';
          let inQuotes = false;

          for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            const nextChar = cleanText[i + 1];

            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              currentRow.push(currentField.trim());
              currentField = '';
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
              if (char === '\r' && nextChar === '\n') {
                i++;
              }
              currentRow.push(currentField.trim());
              currentField = '';

              if (currentRow.some(cell => cell !== '')) {
                rows.push(currentRow);
              }
              currentRow = [];
            } else {
              currentField += char;
            }
          }

          if (currentField !== '' || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(cell => cell !== '')) {
              rows.push(currentRow);
            }
          }

          return rows;
        };

        const rows = parseCSV(text);
        if (rows.length <= 1) {
          toast.error('ไฟล์ CSV ไม่มีข้อมูล');
          return;
        }

        const cleanHeader = (h) => {
          if (!h) return '';
          return h.toLowerCase()
            .replace(/^[\uFEFF\uFFFE]/, '')
            .replace(/["'\s*]/g, '')
            .trim();
        };

        const headers = rows[0].map(cleanHeader);
        
        // Canonical English & Legacy Thai Alias Matchers
        const noIdx = headers.findIndex(h => h === 'no' || h === 'num' || h === 'number' || h.includes('ลำดับ'));
        const typeIdx = headers.findIndex(h => h === 'item_type' || h === 'itemtype' || h === 'type' || h.includes('ประเภท'));
        const skuIdx = headers.findIndex(h => h === 'sku' || h.includes('รหัสวัสดุ') || h.includes('รหัส'));
        const parentSkuIdx = headers.findIndex(h => h === 'parent_sku' || h === 'parentsku' || h === 'parent_id');
        const nameIdx = headers.findIndex(h => h === 'item_name' || h === 'itemname' || h === 'name' || h === 'รายการ' || h === 'ชื่อวัสดุ' || h === 'ชื่อ');
        const modelIdx = headers.findIndex(h => h === 'model' || h === 'รุ่น');
        const qtyIdx = headers.findIndex(h => h === 'quantity' || h === 'qty' || h === 'amount' || h === 'count' || h === 'จำนวน');
        const serialIdx = headers.findIndex(h => h === 'serial_number' || h === 'serialnumber' || h === 'serial' || h === 'sn' || h === 's/n' || h === 's_n');
        const partIdx = headers.findIndex(h => h === 'part_number' || h === 'partnumber' || h === 'part' || h === 'pn' || h === 'part_no' || h === 'partno');
        const notesIdx = headers.findIndex(h => h === 'remark' || h === 'remarks' || h === 'notes' || h === 'note' || h === 'หมายเหตุ');

        const newItems = [];
        let last_seen_parent = null; // State machine context tracker

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (cols.every(c => c === '')) continue;

          const rowNum = i + 1;
          
          // Safe column value extractor to prevent undefined.trim() crashes on incomplete CSV rows
          const getColValue = (idx) => {
            if (idx === -1 || idx === undefined || idx === null || idx >= cols.length) return '';
            const val = cols[idx];
            return (val === undefined || val === null) ? '' : val.toString().trim();
          };

          const rawNo = getColValue(noIdx);
          let rawType = getColValue(typeIdx).toUpperCase();
          const rawSku = getColValue(skuIdx);
          let rawParentSku = getColValue(parentSkuIdx);
          let rawName = getColValue(nameIdx) || (skuIdx !== 0 ? getColValue(1) : getColValue(0));
          const rawModel = getColValue(modelIdx);
          
          const rawQtyStr = getColValue(qtyIdx);
          const cleanQtyStr = rawQtyStr.replace(/["'\s]/g, '');

          const rawNotes = getColValue(notesIdx);
          const rawSerial = getColValue(serialIdx);
          const rawPart = getColValue(partIdx);

          if (!rawType) {
            rawType = 'PARENT';
          }

          if (rawType !== 'PARENT' && rawType !== 'CHILD') {
            console.warn(`CSV Parsing Error [Row ${rowNum}]: Invalid Item_Type "${rawType}"`);
            toast.error(`ไฟล์ CSV แถวที่ ${rowNum}: ประเภทรายการ "${rawType}" ไม่ถูกต้อง (ต้องเป็น PARENT หรือ CHILD)`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          if (!rawName) {
            console.warn(`CSV Parsing Error [Row ${rowNum}]: Missing required field "Item_Name"`);
            toast.error(`ไฟล์ CSV แถวที่ ${rowNum}: ขาดข้อมูล "รายการ" (Item_Name) ซึ่งเป็นข้อมูลจำเป็น`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          const parsedQty = parseInt(cleanQtyStr, 10);
          const validQty = isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;

          if (rawType === 'PARENT') {
            const parentObj = {
              tempId: Date.now() + Math.random() + i,
              no: rawNo ? parseInt(rawNo, 10) || null : null,
              item_type: 'PARENT',
              sku: rawSku.trim(),
              parent_sku: '',
              name: rawName.trim(),
              model: rawModel.trim(),
              quantity: validQty,
              serial_number: rawSerial.trim(),
              part_number: rawPart.trim(),
              notes: rawNotes.trim()
            };
            newItems.push(parentObj);
            last_seen_parent = parentObj;
          } else if (rawType === 'CHILD') {
            if (!rawParentSku && last_seen_parent) {
              rawParentSku = last_seen_parent.sku || '';
            }

            let parentMatch = null;
            if (rawParentSku) {
              parentMatch = newItems.find(item => item.item_type === 'PARENT' && item.sku.toLowerCase() === rawParentSku.toLowerCase());
            } else if (last_seen_parent) {
              parentMatch = last_seen_parent;
              rawParentSku = last_seen_parent.sku || '';
            }

            if (!parentMatch && !last_seen_parent) {
              toast.error(`ไฟล์ CSV แถวที่ ${rowNum}: CHILD item "${rawName}" ไม่มีรายการหลัก (PARENT) ก่อนหน้าหรือระบุ Parent_SKU ที่ไม่มีอยู่จริง`);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }

            if (rawParentSku && !parentMatch) {
              toast.error(`ไฟล์ CSV แถวที่ ${rowNum}: CHILD item "${rawName}" อ้างอิง Parent_SKU "${rawParentSku}" ไม่พบรายการหลักในระบบ`);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }

            newItems.push({
              tempId: Date.now() + Math.random() + i,
              no: null,
              item_type: 'CHILD',
              sku: rawSku.trim(),
              parent_sku: rawParentSku,
              name: rawName.trim(),
              model: rawModel.trim(),
              quantity: validQty,
              serial_number: rawSerial.trim(),
              part_number: rawPart.trim(),
              notes: rawNotes.trim()
            });
          }
        }

        if (newItems.length > 0) {
          setLineItems(newItems);
          toast.success(`นำเข้าข้อมูลจาก CSV สำเร็จ ${newItems.length} รายการ (รักษา Parent/Child Hierarchy)`);
        } else {
          toast.error('ไม่พบบรรทัดข้อมูลที่ถูกต้องในไฟล์ CSV');
        }
      } catch (err) {
        console.error('CSV Parsing error:', err);
        toast.error('เกิดข้อผิดพลาดในการนำเข้า CSV: ' + err.message);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Submit Order via Direct Resolution & Supabase Atomic RPC process_stock_in
  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.project_id) {
      return toast.error('กรุณาเลือกโครงการปลายทางก่อนบันทึกรับเข้า');
    }

    if (lineItems.length === 0) {
      return toast.error('กรุณาเพิ่มรายการวัสดุรับเข้าอย่างน้อย 1 รายการ');
    }

    // Validate rows
    const invalidRows = lineItems.filter(row => (!row.name && !row.sku) || !row.model || !row.model.trim() || !row.quantity || parseInt(row.quantity, 10) <= 0);
    if (invalidRows.length > 0) {
      return toast.error('มีรายการวัสดุที่ไม่ได้ระบุรายการ/รุ่น/SKU หรือระบุจำนวนไม่ถูกต้อง');
    }

    // Validate CHILD rows have parent_sku or parent context
    const invalidChildRows = lineItems.filter(row => row.item_type === 'CHILD' && !row.parent_sku && !lineItems.some(p => p.item_type === 'PARENT' && p.sku));
    if (invalidChildRows.length > 0) {
      return toast.error('มีรายการย่อย (CHILD) ที่ไม่ได้ระบุ Parent SKU หรือไม่มีรายการหลักในระบบ');
    }

    try {
      setIsSubmitting(true);

      // Resolve or auto-create items in public.items directly
      const payloadItems = [];
      for (const row of lineItems) {
        const normSku = (row.sku || '').trim().toLowerCase();
        const normName = (row.name || '').trim().toLowerCase();

        // 1. Check existing items array
        let matched = items.find(i => 
          (normSku && i.sku && i.sku.trim().toLowerCase() === normSku) ||
          (normName && i.name && i.name.trim().toLowerCase() === normName)
        );

        let resolvedItemId = matched?.id;

        // 2. If not found in current items state, insert directly into public.items
        if (!resolvedItemId) {
          const { data: newItem, error: insertError } = await supabase
            .from('items')
            .insert({
              name: row.name || row.sku || 'รายการรับเข้าใหม่',
              sku: row.sku || null,
              model: row.model || null,
              unit: 'ชิ้น',
              item_type: row.item_type || 'PARENT',
              parent_sku: row.parent_sku || null,
              description: row.notes || null,
              notes: row.notes || null
            })
            .select('id')
            .single();

          if (insertError) {
            // If duplicate SKU constraint hit, fetch existing ID
            const { data: existing } = await supabase
              .from('items')
              .select('id')
              .eq('sku', row.sku)
              .maybeSingle();
            resolvedItemId = existing?.id;
          } else {
            resolvedItemId = newItem?.id;
          }
        } else if (matched) {
          // If existing item found, sync model & description if missing
          const updatePayload = {};
          if (row.model && (!matched.model || matched.model === '-')) updatePayload.model = row.model;
          if (row.notes && !matched.description) updatePayload.description = row.notes;
          if (row.name && (matched.name === 'PARENT' || matched.name === 'CHILD')) updatePayload.name = row.name;

          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('items').update(updatePayload).eq('id', resolvedItemId);
          }
        }

        payloadItems.push({
          item_id: resolvedItemId,
          sku: row.sku || null,
          parent_sku: row.parent_sku || null,
          item_type: row.item_type || 'PARENT',
          seq_no: row.no ? parseInt(row.no, 10) : null,
          name: row.name || row.sku,
          model: row.model || null,
          quantity: parseInt(row.quantity, 10),
          delivery_to: null,
          serial_number: row.serial_number || null,
          part_number: row.part_number || null,
          notes: row.notes || null
        });
      }

      // Call Atomic Supabase RPC process_stock_in
      const { data, error } = await supabase.rpc('process_stock_in', {
        p_project_id: formData.project_id,
        p_items: payloadItems
      });

      if (error) throw error;

      toast.success('บันทึกรับเข้าสต็อก (Stock Receipt) สำเร็จ');
      setIsCreateDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('StockIn Submit Error:', error);
      toast.error('เกิดข้อผิดพลาดในการบันทึกรับเข้าสต็อก: ' + (error.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewOrderDetails = async (order) => {
    try {
      const { data, error } = await supabase
        .from('stock_in_items')
        .select('*, items!item_id(name, model, unit, sku)')
        .eq('order_id', order.id);
      if (error) throw error;
      setOrderDetails(data || []);
      setSelectedOrder(order);
    } catch (error) {
      console.error('viewOrderDetails error:', error);
      toast.error('ไม่สามารถโหลดรายละเอียดได้');
    }
  };

  // Receipt summary calculations
  const totalItemsCount = lineItems.length;
  const totalQuantitySum = lineItems.reduce((acc, row) => acc + (parseInt(row.quantity, 10) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="w-8 h-8 text-green-500" />
            รับเข้าสต็อก (Stock Receipt)
          </h2>
          <p className="text-muted-foreground mt-2">ประวัติและใบบันทึกการรับเข้าวัสดุเข้าคลังโครงการ (รองรับโครงสร้าง Parent-Child)</p>
        </div>
        
        {can('stock_in.create') && (
          <Button 
            className="h-10 px-4 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md hover:shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 shrink-0"
            onClick={handleOpenCreateDialog}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>บันทึกรับเข้าสต็อก</span>
          </Button>
        )}
      </div>

      {/* Main Stock Receipts Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>วันที่รับเข้า</TableHead>
              <TableHead>โครงการปลายทาง</TableHead>
              <TableHead>ผู้บันทึก</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">กำลังโหลดข้อมูล...</TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">ไม่มีข้อมูลบิลรับเข้า</TableCell></TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-muted-foreground">{format(new Date(o.created_at), 'dd/MM/yy HH:mm')}</TableCell>
                  <TableCell className="font-medium">
                    {o.projects?.project_code ? `${o.projects.project_code} — ` : ''}{o.projects?.name}
                  </TableCell>
                  <TableCell>{o.profiles?.full_name}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => viewOrderDetails(o)}>
                      ดูรายละเอียด
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Direct Stock Receipt Modal */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitOrder}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
                บันทึกรับเข้าสต็อก (Direct Stock Receipt - Parent/Child Hierarchy)
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Destination Project Selection */}
              <div className="bg-muted/40 p-4 rounded-xl border neu-pressed space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>โครงการปลายทาง & สถานที่ตั้ง (Destination Project & Location)</span>
                      <span className="text-destructive">*</span>
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {(() => {
                        const map = new Map();
                        projects.forEach(p => {
                          const k = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
                          map.set(k, true);
                        });
                        return `${map.size} โครงการหลัก (${projects.length} สถานที่ตั้ง)`;
                      })()}
                    </span>
                  </label>
                  
                  <select 
                    required 
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 font-medium transition-all shadow-sm cursor-pointer" 
                    value={formData.project_id} 
                    onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                  >
                    <option value="" disabled>-- เลือกโครงการปลายทางและสถานที่ตั้งจัดเก็บ --</option>
                    {(() => {
                      const map = new Map();
                      projects.forEach(p => {
                        const nameKey = (p.name || '').trim();
                        const codeKey = (p.project_code || '').trim();
                        const key = `${nameKey}|||${codeKey}`;

                        if (!map.has(key)) {
                          map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
                        } else {
                          map.get(key).locations.push(p);
                        }
                      });
                      
                      return Array.from(map.values()).map(group => (
                        <optgroup 
                          key={group.key} 
                          label={`โครงการ: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}
                        >
                          {group.locations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                              {loc.location || 'คลังหลัก / ไม่ระบุสถานที่'} {loc.description ? `— ${loc.description}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                </div>

                {/* Selection Summary Preview Card */}
                {formData.project_id && (() => {
                  const p = projects.find(item => item.id === formData.project_id);
                  if (!p) return null;
                  return (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2 animate-in fade-in-50">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-foreground truncate">
                          โครงการ: {p.project_code ? (
                            <span className="font-mono text-emerald-700 dark:text-emerald-300 font-semibold mr-1">
                              [{p.project_code}]
                            </span>
                          ) : ''}
                          {p.name}
                        </div>
                        <div className="text-muted-foreground truncate font-medium">
                          สถานที่ตั้ง: <span className="text-foreground font-semibold">{p.location || 'คลังหลัก'}</span>
                          {p.description ? ` (${p.description})` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono text-[10px] font-bold">
                        SELECTED
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* CSV Tools Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-green-50/50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                  <Upload className="w-4 h-4" />
                  <span className="font-semibold">นำเข้าด้วยไฟล์ CSV โครงสร้าง Parent-Child (รองรับภาษาไทย UTF-8 BOM)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    className="h-8 text-xs gap-1 border-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                    onClick={handleDownloadCsvTemplate}
                  >
                    <Download className="w-3.5 h-3.5" /> ดาวน์โหลด CSV Template
                  </Button>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleCsvFileUpload} 
                  />
                  <Button 
                    type="button" 
                    size="sm"
                    className="h-8 text-xs gap-1 bg-green-700 hover:bg-green-800 text-white font-semibold"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" /> นำเข้าไฟล์ .csv
                  </Button>
                </div>
              </div>

              {/* Dynamic Line Items Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    รายการวัสดุรับเข้า ({lineItems.length} รายการ)
                  </h3>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => handleAddLineItem('PARENT')}
                    >
                      <Plus className="w-3.5 h-3.5" /> + เพิ่มรายการหลัก (PARENT)
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                      onClick={() => {
                        const lastParent = lineItems.slice().reverse().find(i => i.item_type === 'PARENT');
                        handleAddLineItem('CHILD', lastParent?.sku || '');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" /> + เพิ่มรายการย่อย (CHILD)
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="text-xs">
                        <TableHead className="w-[8%] min-w-[75px]">ประเภท</TableHead>
                        <TableHead className="w-[10%] min-w-[100px]">รหัสวัสดุ (SKU)</TableHead>
                        <TableHead className="w-[9%] min-w-[95px]">Parent SKU</TableHead>
                        <TableHead className="w-[20%] min-w-[160px]">รายการ *</TableHead>
                        <TableHead className="w-[12%] min-w-[110px]">รุ่น *</TableHead>
                        <TableHead className="w-[7%] min-w-[65px] text-center">จำนวน *</TableHead>
                        <TableHead className="w-[10%] min-w-[95px]">S/N</TableHead>
                        <TableHead className="w-[10%] min-w-[95px]">Part No.</TableHead>
                        <TableHead className="w-[10%] min-w-[110px]">หมายเหตุ</TableHead>
                        <TableHead className="w-[4%] min-w-[45px] text-center">ลบ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-6 text-muted-foreground text-sm">
                            ยังไม่มีรายการวัสดุ กด "+ เพิ่มรายการหลัก" หรือนำเข้าไฟล์ CSV
                          </TableCell>
                        </TableRow>
                      ) : (
                        lineItems.map((row) => {
                          const isChild = row.item_type === 'CHILD';
                          return (
                            <TableRow key={row.tempId} className={isChild ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}>
                              <TableCell className="align-top">
                                <select 
                                  value={row.item_type} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'item_type', e.target.value)}
                                  className={`h-9 w-full rounded border px-1 text-[11px] font-bold ${isChild ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200'}`}
                                >
                                  <option value="PARENT">PARENT</option>
                                  <option value="CHILD">CHILD</option>
                                </select>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="SKU-001" 
                                  value={row.sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'sku', e.target.value)} 
                                  className="h-9 text-xs font-mono font-semibold"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder={isChild ? "Parent SKU" : "-"} 
                                  disabled={!isChild}
                                  value={row.parent_sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'parent_sku', e.target.value)} 
                                  className="h-9 text-xs font-mono disabled:opacity-40"
                                />
                              </TableCell>

                              <TableCell className={`align-top ${isChild ? 'pl-6' : ''}`}>
                                <div className="flex items-center gap-1">
                                  {isChild && <span className="text-blue-500 font-mono text-xs select-none">└─</span>}
                                  <Input 
                                    required
                                    placeholder={isChild ? "ระบุรายการย่อย" : "ระบุรายการ"} 
                                    value={row.name} 
                                    onChange={e => handleUpdateLineItem(row.tempId, 'name', e.target.value)} 
                                    className={`h-9 text-xs ${isChild ? 'font-medium text-blue-950 dark:text-blue-200' : 'font-semibold'}`}
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  required
                                  placeholder="ระบุรุ่น" 
                                  value={row.model} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'model', e.target.value)} 
                                  className="h-9 text-xs font-medium"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  type="number" 
                                  min="1" 
                                  required 
                                  value={row.quantity ?? ''} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'quantity', e.target.value)} 
                                  className="h-9 text-center text-xs font-bold px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="S/N (ถ้ามี)" 
                                  value={row.serial_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'serial_number', e.target.value)} 
                                  className="h-9 text-xs font-mono"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Part No." 
                                  value={row.part_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'part_number', e.target.value)} 
                                  className="h-9 text-xs font-mono"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="หมายเหตุ" 
                                  value={row.notes} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'notes', e.target.value)} 
                                  className="h-9 text-xs"
                                />
                              </TableCell>

                              <TableCell className="align-top text-center">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveLineItem(row.tempId)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Receipt Summary Calculation */}
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border text-sm">
                <div className="flex gap-6 text-xs sm:text-sm font-medium">
                  <span>รวมรายการ: <strong className="text-foreground font-bold">{totalItemsCount}</strong> รายการ</span>
                  <span>รายการหลัก (PARENT): <strong className="text-green-600 font-bold">{lineItems.filter(i => i.item_type === 'PARENT').length}</strong></span>
                  <span>รายการย่อย (CHILD): <strong className="text-blue-600 font-bold">{lineItems.filter(i => i.item_type === 'CHILD').length}</strong></span>
                  <span>รวมจำนวนวัสดุ: <strong className="text-emerald-600 font-bold">{totalQuantitySum}</strong> ชิ้น</span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                className="h-10 px-5 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={isSubmitting || !formData.project_id || lineItems.some(i => (!i.name && !i.sku) || !i.model?.trim())}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                    <span>กำลังบันทึกรับเข้า...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>ยืนยันบันทึกรับเข้าสต็อก</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-2xl glass shadow-2xl border-white/20 dark:border-slate-800">
          <DialogHeader className="pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                <div className="p-2 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <span>รายละเอียดบิลรับเข้าสต็อก (Stock Receipt)</span>
              </DialogTitle>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                Parent/Child Hierarchy
              </span>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Metadata Summary Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-muted/40 p-4 rounded-xl border neu-pressed">
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium block">โครงการปลายทาง</span>
                <span className="font-bold text-sm text-foreground block">
                  {selectedOrder?.projects?.project_code ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono mr-1">
                      [{selectedOrder.projects.project_code}]
                    </span>
                  ) : ''}
                  {selectedOrder?.projects?.name || '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium block">ผู้บันทึกรายการ</span>
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {(selectedOrder?.profiles?.full_name || 'A')[0].toUpperCase()}
                  </div>
                  {selectedOrder?.profiles?.full_name || 'Admin User'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium block">วันที่รับเข้า</span>
                <span className="font-semibold font-mono text-foreground block">
                  {selectedOrder && format(new Date(selectedOrder.created_at), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
            </div>
            
            {/* Items Summary Header */}
            <div className="flex items-center justify-between pt-1">
              <h4 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Package className="w-4 h-4 text-emerald-500" />
                <span>รายการวัสดุในบิลนี้ ({orderDetails.length} รายการ)</span>
              </h4>
              <span className="text-xs text-muted-foreground font-mono">
                รวมจำนวน: {orderDetails.reduce((sum, item) => sum + (item.quantity || 0), 0)} ชิ้น
              </span>
            </div>

            {/* Scrollable Items Table */}
            <div className="border rounded-xl overflow-hidden shadow-sm max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-muted/60 sticky top-0 z-10 backdrop-blur text-xs">
                  <TableRow className="border-b">
                    <TableHead className="w-[10%] font-bold">ประเภท</TableHead>
                    <TableHead className="w-[38%] font-bold">SKU / รายการวัสดุ</TableHead>
                    <TableHead className="w-[15%] font-bold">รุ่น</TableHead>
                    <TableHead className="w-[10%] text-right font-bold">จำนวน</TableHead>
                    <TableHead className="w-[8%] font-bold">หน่วย</TableHead>
                    <TableHead className="w-[19%] font-bold">S/N & Part No. / หมายเหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orderDetails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        ไม่มีข้อมูลรายการวัสดุในบิลนี้
                      </TableCell>
                    </TableRow>
                  ) : (
                    orderDetails.map(item => {
                      const isChild = item.item_type === 'CHILD' || !!item.parent_sku;
                      const itemName = (item.items?.name && item.items.name !== item.items?.sku)
                        ? item.items.name 
                        : (item.notes || item.items?.name || item.items?.sku || '-');

                      return (
                        <TableRow 
                          key={item.id} 
                          className={`transition-colors hover:bg-muted/40 ${isChild ? "bg-blue-50/30 dark:bg-blue-950/20" : ""}`}
                        >
                          <TableCell className="align-top">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isChild 
                                ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700' 
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700'
                            }`}>
                              {item.item_type || (isChild ? 'CHILD' : 'PARENT')}
                            </span>
                          </TableCell>

                          <TableCell className={`align-top ${isChild ? 'pl-6' : ''}`}>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isChild && <span className="text-blue-500 font-mono text-xs select-none">└─</span>}
                                {item.items?.sku && (
                                  <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                                    [{item.items.sku}]
                                  </span>
                                )}
                                <span className={`font-semibold ${isChild ? 'text-blue-950 dark:text-blue-200' : 'text-foreground'}`}>
                                  {itemName}
                                </span>
                              </div>
                              {item.parent_sku && (
                                <div className="text-[10px] text-muted-foreground font-mono pl-4">
                                  └─ Parent SKU: <span className="font-bold text-blue-600 dark:text-blue-400">{item.parent_sku}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="align-top font-medium text-foreground">
                            {item.model || item.items?.model || '-'}
                          </TableCell>

                          <TableCell className="align-top text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">
                            +{item.quantity}
                          </TableCell>

                          <TableCell className="align-top text-muted-foreground font-medium">
                            {item.items?.unit || 'ชิ้น'}
                          </TableCell>

                          <TableCell className="align-top text-muted-foreground font-mono text-[11px] space-y-0.5">
                            {item.serial_number && (
                              <div className="text-foreground">SN: <span className="font-bold">{item.serial_number}</span></div>
                            )}
                            {item.part_number && (
                              <div>PN: {item.part_number}</div>
                            )}
                            {item.notes && item.notes !== itemName && (
                              <div className="text-[10px] text-muted-foreground italic">{item.notes}</div>
                            )}
                            {!item.serial_number && !item.part_number && (!item.notes || item.notes === itemName) && (
                              <span>-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t shrink-0">
            <Button 
              type="button" 
              variant="outline" 
              className="px-6 rounded-xl font-semibold hover:bg-muted"
              onClick={() => setSelectedOrder(null)}
            >
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockIn;
