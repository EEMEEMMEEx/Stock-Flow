import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowDownToLine, Download, Upload, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const StockIn = () => {
  const { isAdmin } = useAuth();
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
        .select('*, projects(name, project_code), profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (oError && oError.code !== '42P01') throw oError;
      setOrders(oData || []);

      // Fetch active projects & items master
      const { data: pData } = await supabase
        .from('projects')
        .select('id, name, project_code')
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

  const createEmptyRow = () => ({
    tempId: Date.now() + Math.random(),
    sku: '',
    name: '',
    quantity: 1,
    serial_number: '',
    part_number: ''
  });

  const handleAddLineItem = () => {
    setLineItems(prev => [...prev, createEmptyRow()]);
  };

  const handleRemoveLineItem = (tempId) => {
    setLineItems(prev => prev.filter(item => item.tempId !== tempId));
  };

  const handleUpdateLineItem = (tempId, field, value) => {
    setLineItems(prev => prev.map(row => {
      if (row.tempId !== tempId) return row;
      return { ...row, [field]: value };
    }));
  };

  // Download CSV Template with UTF-8 BOM (\uFEFF)
  const handleDownloadCsvTemplate = () => {
    const bom = '\uFEFF';
    const csvContent = bom + 
      `"SKU / รหัสวัสดุ","ชื่อวัสดุ","จำนวน","Serial Number","Part Number"\n` +
      `"SKU-001","สายไฟ THW 1x2.5 sq.mm.","100","SN10023","PN-992"\n` +
      `"SKU-002","ท่อ PVC 1/2 นิ้ว","50","",""\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'stock_in_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ดาวน์โหลด CSV Template (UTF-8 BOM) เรียบร้อย');
  };

  // Direct CSV File Parsing (No Master Items lookup required)
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

        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length <= 1) {
          toast.error('ไฟล์ CSV ไม่มีข้อมูล');
          return;
        }

        const parseLine = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
        
        // Find column indices
        const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('รหัส'));
        const nameIdx = headers.findIndex(h => h.includes('ชื่อ') || h.includes('name') || h.includes('item'));
        const qtyIdx = headers.findIndex(h => h.includes('จำนวน') || h.includes('qty') || h.includes('quantity'));
        const serialIdx = headers.findIndex(h => h.includes('serial') || h.includes('sn'));
        const partIdx = headers.findIndex(h => h.includes('part') || h.includes('pn'));

        const newItems = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i]);
          if (cols.every(c => c === '')) continue;

          const rawSku = (skuIdx !== -1 ? cols[skuIdx] : cols[0]) || '';
          const rawName = (nameIdx !== -1 ? cols[nameIdx] : (skuIdx !== 0 ? cols[1] : cols[0])) || '';
          const rawQty = (qtyIdx !== -1 ? cols[qtyIdx] : cols[2]) || '1';
          const rawSerial = (serialIdx !== -1 ? cols[serialIdx] : cols[3]) || '';
          const rawPart = (partIdx !== -1 ? cols[partIdx] : cols[4]) || '';

          const parsedQty = parseInt(rawQty, 10);
          const validQty = isNaN(parsedQty) || parsedQty <= 0 ? 1 : parsedQty;

          newItems.push({
            tempId: Date.now() + Math.random() + i,
            sku: rawSku,
            name: rawName || rawSku || `วัสดุแถวที่ ${i}`,
            quantity: validQty,
            serial_number: rawSerial,
            part_number: rawPart
          });
        }

        if (newItems.length > 0) {
          setLineItems(newItems);
          toast.success(`นำเข้าไฟล์ CSV จำนวน ${newItems.length} รายการเรียบร้อยแล้ว`);
        }
      } catch (err) {
        console.error(err);
        toast.error('ไม่สามารถอ่านไฟล์ CSV ได้ กรุณาตรวจสอบรูปแบบไฟล์');
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
    const invalidRows = lineItems.filter(row => (!row.name && !row.sku) || !row.quantity || parseInt(row.quantity, 10) <= 0);
    if (invalidRows.length > 0) {
      return toast.error('มีรายการวัสดุที่ไม่ได้ระบุชื่อ/SKU หรือระบุจำนวนไม่ถูกต้อง');
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
              name: row.name || row.sku || 'วัสดุรับเข้าใหม่',
              sku: row.sku || null,
              unit: 'ชิ้น'
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
        }

        payloadItems.push({
          item_id: resolvedItemId,
          sku: row.sku || null,
          name: row.name || row.sku,
          quantity: parseInt(row.quantity, 10),
          delivery_to: null,
          serial_number: row.serial_number || null,
          part_number: row.part_number || null
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
        .select('*, items(name, unit, sku)')
        .eq('order_id', order.id);
      if (error) throw error;
      setOrderDetails(data || []);
      setSelectedOrder(order);
    } catch (error) {
      toast.error('ไม่สามารถโหลดรายละเอียดได้');
    }
  };

  // Receipt summary calculations
  const totalItemsCount = lineItems.length;
  const totalQuantitySum = lineItems.reduce((acc, row) => acc + (parseInt(row.quantity, 10) || 0), 0);

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-semibold">Access Denied: Admin role required.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="w-8 h-8 text-green-500" />
            รับเข้าสต็อก (Stock Receipt)
          </h2>
          <p className="text-muted-foreground mt-2">ประวัติและใบบันทึกการรับเข้าวัสดุเข้าคลังโครงการ</p>
        </div>
        
        <Button 
          className="shadow-lg shadow-primary/20 bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center gap-2"
          onClick={handleOpenCreateDialog}
        >
          <Plus className="w-5 h-5" /> + บันทึกรับเข้าสต็อก
        </Button>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitOrder}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
                บันทึกรับเข้าสต็อก (Direct Stock Receipt)
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Destination Project Selection */}
              <div className="bg-muted/30 p-4 rounded-lg border">
                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-1">
                    โครงการปลายทาง (Destination Project) <span className="text-destructive">*</span>
                  </label>
                  <select 
                    required 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 font-medium" 
                    value={formData.project_id} 
                    onChange={e => setFormData({ project_id: e.target.value })}
                  >
                    <option value="" disabled>-- เลือกโครงการปลายทาง --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code ? `${p.project_code} — ` : ''}{p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CSV Tools Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-green-50/50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                  <Upload className="w-4 h-4" />
                  <span className="font-semibold">นำเข้าข้อมูลโดยตรงด้วยไฟล์ CSV (รองรับภาษาไทย UTF-8 BOM)</span>
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
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    รายการวัสดุรับเข้า ({lineItems.length} รายการ)
                  </h3>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    className="h-8 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                    onClick={handleAddLineItem}
                  >
                    <Plus className="w-3.5 h-3.5" /> + เพิ่มรายการวัสดุ
                  </Button>
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="text-xs">
                        <TableHead className="w-[20%]">รหัสวัสดุ (SKU)</TableHead>
                        <TableHead className="w-[35%]">ชื่อวัสดุ *</TableHead>
                        <TableHead className="w-[15%] text-center">จำนวน *</TableHead>
                        <TableHead className="w-[22%]">Serial / Part Number</TableHead>
                        <TableHead className="w-[8%] text-center">ลบ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                            ยังไม่มีรายการวัสดุ กด "+ เพิ่มรายการวัสดุ" หรือนำเข้าไฟล์ CSV
                          </TableCell>
                        </TableRow>
                      ) : (
                        lineItems.map((row) => (
                          <TableRow key={row.tempId}>
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
                                required
                                placeholder="ระบุชื่อวัสดุ" 
                                value={row.name} 
                                onChange={e => handleUpdateLineItem(row.tempId, 'name', e.target.value)} 
                                className="h-9 text-xs font-medium"
                              />
                            </TableCell>

                            <TableCell className="align-top">
                              <Input 
                                type="number" 
                                min="1" 
                                required 
                                value={row.quantity} 
                                onChange={e => handleUpdateLineItem(row.tempId, 'quantity', e.target.value)} 
                                className="h-9 text-center text-xs font-bold"
                              />
                            </TableCell>

                            <TableCell className="align-top space-y-1">
                              <Input 
                                placeholder="S/N (ถ้ามี)" 
                                value={row.serial_number} 
                                onChange={e => handleUpdateLineItem(row.tempId, 'serial_number', e.target.value)} 
                                className="h-7 text-[11px]"
                              />
                              <Input 
                                placeholder="Part No. (ถ้ามี)" 
                                value={row.part_number} 
                                onChange={e => handleUpdateLineItem(row.tempId, 'part_number', e.target.value)} 
                                className="h-7 text-[11px]"
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
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Receipt Summary Calculation */}
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border text-sm">
                <div className="flex gap-6 text-xs sm:text-sm font-medium">
                  <span>รวมรายการ: <strong className="text-foreground font-bold">{totalItemsCount}</strong> รายการ</span>
                  <span>รวมจำนวนวัสดุ: <strong className="text-green-600 font-bold">{totalQuantitySum}</strong> ชิ้น</span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                className="bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center gap-2" 
                disabled={isSubmitting || !formData.project_id || lineItems.some(i => !i.name && !i.sku)}
              >
                {isSubmitting ? 'กำลังบันทึกรับเข้า...' : 'ยืนยันบันทึกรับเข้าสต็อก (Stock Receipt)'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>รายละเอียดบิลรับเข้าสต็อก</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm bg-muted/30 p-3 rounded border">
              <div>
                <span className="text-muted-foreground">โครงการ:</span>{' '}
                <span className="font-semibold">
                  {selectedOrder?.projects?.project_code ? `${selectedOrder.projects.project_code} — ` : ''}{selectedOrder?.projects?.name}
                </span>
              </div>
              <div><span className="text-muted-foreground">ผู้บันทึก:</span> <span className="font-medium">{selectedOrder?.profiles?.full_name}</span></div>
              <div><span className="text-muted-foreground">วันที่รับเข้า:</span> <span>{selectedOrder && format(new Date(selectedOrder.created_at), 'dd/MM/yy HH:mm')}</span></div>
            </div>
            
            <h4 className="font-semibold mb-2 text-sm">รายการวัสดุ ({orderDetails.length} รายการ)</h4>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30 text-xs">
                  <TableRow>
                    <TableHead>SKU / ชื่อวัสดุ</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                    <TableHead>หน่วย</TableHead>
                    <TableHead>S/N & Part No.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orderDetails.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.items?.sku ? <span className="text-muted-foreground mr-1">[{item.items.sku}]</span> : ''}
                        {item.items?.name}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-bold">+{item.quantity}</TableCell>
                      <TableCell>{item.items?.unit}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[11px]">
                        {item.serial_number ? `SN: ${item.serial_number}` : ''}
                        {item.serial_number && item.part_number ? ' | ' : ''}
                        {item.part_number ? `PN: ${item.part_number}` : ''}
                        {!item.serial_number && !item.part_number ? '-' : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockIn;
