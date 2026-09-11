import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  ArrowDownToLine, Download, Upload, Plus, Trash2, Check, 
  RefreshCw, Package, Building2, FileSpreadsheet, Layers, 
  Filter, CheckCircle2, Search, 
  ArrowRight, 
  MapPin, SlidersHorizontal, BarChart3, CornerDownRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { dispatchStockInNotification } from '@/lib/notificationDispatcher';

import { 
  parseDopaStockCsv, 
  matchLocationToWarehouseColumn, 
  filterAndAggregateWarehouseItems 
} from '@/lib/stock-in-parser';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';
import { useTranslation } from '@/i18n';
import { formatI18nDate, formatI18nNumber } from '@/lib/i18n-format';

const StockIn = () => {
  const { can, user } = useAuth();
  const { t } = useTranslation();
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
  
  // Master Raw Parsed Items from CSV (to allow dynamic warehouse re-filtering anytime)
  const [rawParsedCsvItems, setRawParsedCsvItems] = useState([]);
  const [csvDetectedWarehouses, setCsvDetectedWarehouses] = useState([]);

  // File Input Ref for CSV Upload
  const fileInputRef = useRef(null);

  // Interactive CSV Preview Modal State
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [selectedQtySource, setSelectedQtySource] = useState('คงเหลือ');
  const [onlyPositiveFilter, setOnlyPositiveFilter] = useState(true);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [importFileName, setImportFileName] = useState('');

  // Details Dialog State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Parallelize fetching stock in orders, active projects, and items
      const [oRes, pRes, iRes] = await Promise.all([
        supabase
          .from('stock_in_orders')
          .select('*, projects(name, project_code, location, description), profiles(full_name)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('projects')
          .select('id, name, project_code, location, description')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('items')
          .select('id, name, unit, sku, image_url, category_id, model, description')
      ]);
        
      if (oRes.error && oRes.error.code !== '42P01') throw oRes.error;
      setOrders(oRes.data || []);
      setProjects(pRes.data || []);
      setItems(iRes.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    const defaultProjId = projects[0]?.id || '';
    setFormData({ project_id: defaultProjId });
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

  // Download CSV Template with DOPA+USO Standard Format (UTF-8 BOM \uFEFF)
  const handleDownloadCsvTemplate = () => {
    const bom = '\uFEFF';
    const csvContent = bom + 
      `ลำดับ,Part No.,,รายการ,รุ่น/ยี่ห้อ,คลัง Factory C,คลัง EMS (SAP),เบิกใช้งาน,คงเหลือ,หมายเหตุ\n` +
      `1,,PARENT,ตู้ชุดDMO-GW+ขาตั้ง (ตั้งนอกอาคาร), -,7,,,7,ส่งมอบกรมการปกครอง DMO\n` +
      `,,CHILD,    - Support ขายึด SC-489 (2ชุด/1ตู้), -,3,,,3,\n` +
      `,,CHILD,    - Lightning_arrestor NF-NF,Comsolution,5,,,5,\n` +
      `1,30207-0024-04412,,สายอากาศ SC-488-HF1LDF(D00),Sinclar/Base,,6,,6,\n` +
      `2,30207-0024-01779,,สายอากาศ Yagi 406-SF1SNF (ABK),Sinclar/Fixed,10,5,,15,\n` +
      `3,30207-0024-01903,,CellFlex cable 1/2" (500m.),Comsolution,2317,1000,,3317,2317 อยู่โรงสีรอขอย้ายเข้า EMS\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'DOPA_USO_Equipment_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t('common.success'));
  };

  // Direct CSV File Parsing with Native DOPA+USO & Multi-Warehouse Detection
  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') return;

        const { items: parsed, detectedWarehouses } = parseDopaStockCsv(text);
        
        if (parsed.length === 0) {
          toast.error(t('stockIn.csvImport.noItemsMatch'));
          return;
        }

        setRawParsedCsvItems(parsed);
        setCsvDetectedWarehouses(detectedWarehouses);

        const initialProjectId = formData.project_id || projects[0]?.id || '';
        setPreviewProjectId(initialProjectId);

        // Auto-match warehouse from initial selected project location
        const targetProj = projects.find(p => p.id === initialProjectId);
        const matchedWh = targetProj ? matchLocationToWarehouseColumn(targetProj.location, detectedWarehouses) : null;
        const initialSource = matchedWh || 'คงเหลือ';

        setSelectedQtySource(initialSource);
        setOnlyPositiveFilter(true);

        const aggregated = filterAndAggregateWarehouseItems(parsed, initialSource, { filterZeroQty: true });
        setPreviewItems(aggregated);
        setPreviewSearch('');
        setIsImportPreviewOpen(true);
        toast.success(t('stockIn.toasts.csvParsed', { count: parsed.length }));
      } catch (err) {
        console.error('CSV Parsing error:', err);
        toast.error(t('stockIn.toasts.csvParseError'));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Handle Project Location change in Preview Modal -> Auto match warehouse & aggregate balance
  const handlePreviewProjectChange = (newProjId) => {
    setPreviewProjectId(newProjId);
    const targetProj = projects.find(p => p.id === newProjId);
    if (!targetProj || rawParsedCsvItems.length === 0) return;

    const matchedWh = matchLocationToWarehouseColumn(targetProj.location, csvDetectedWarehouses);
    if (matchedWh) {
      setSelectedQtySource(matchedWh);
      const aggregated = filterAndAggregateWarehouseItems(rawParsedCsvItems, matchedWh, { filterZeroQty: onlyPositiveFilter });
      setPreviewItems(aggregated);
      toast.success(`Filtered by [${targetProj.location}]: ${aggregated.length} item(s) found`);
    }
  };

  // Handle Manual Switch of quantity source in preview (e.g. 'คงเหลือ' vs 'คลัง Factory C' vs 'คลัง EMS')
  const handleChangeQtySource = (sourceName, filterZero = onlyPositiveFilter) => {
    setSelectedQtySource(sourceName);
    if (rawParsedCsvItems.length > 0) {
      const aggregated = filterAndAggregateWarehouseItems(rawParsedCsvItems, sourceName, { filterZeroQty: filterZero });
      setPreviewItems(aggregated);
    }
  };

  // Toggle filter for only positive balance
  const handleToggleOnlyPositive = () => {
    const nextVal = !onlyPositiveFilter;
    setOnlyPositiveFilter(nextVal);
    handleChangeQtySource(selectedQtySource, nextVal);
  };

  // Handle Project Location change in Direct Creation Modal -> Auto re-filter lineItems if CSV data is present
  const handleDirectProjectChange = (newProjId) => {
    setFormData(prev => ({ ...prev, project_id: newProjId }));
    
    if (rawParsedCsvItems.length > 0) {
      const targetProj = projects.find(p => p.id === newProjId);
      if (targetProj) {
        const matchedWh = matchLocationToWarehouseColumn(targetProj.location, csvDetectedWarehouses);
        if (matchedWh) {
          const aggregated = filterAndAggregateWarehouseItems(rawParsedCsvItems, matchedWh, { filterZeroQty: true });
          if (aggregated.length > 0) {
            setLineItems(aggregated);
            toast.success(`Updated items for [${targetProj.location}]: ${aggregated.length} item(s)`);
          }
        }
      }
    }
  };

  // Apply preview items to form
  const handleApplyPreviewToForm = () => {
    if (previewItems.length === 0) return;
    setLineItems(previewItems);
    setFormData(prev => ({ ...prev, project_id: previewProjectId || prev.project_id || projects[0]?.id || '' }));
    setIsImportPreviewOpen(false);
    setIsCreateDialogOpen(true);
    toast.success(`Loaded ${previewItems.length} item(s) into the form`);
  };

  // Direct Submit from Preview Dialog
  const handleDirectSubmitFromPreview = async () => {
    if (!previewProjectId) {
      return toast.error('Please select a storage location before recording stock receipt');
    }
    if (previewItems.length === 0) {
      return toast.error('No items available to record stock receipt');
    }

    setFormData(prev => ({ ...prev, project_id: previewProjectId }));
    setLineItems(previewItems);
    await executeStockInSubmission(previewProjectId, previewItems);
    setIsImportPreviewOpen(false);
  };

  // Execute Stock In Submission Core
  const executeStockInSubmission = async (projectId, itemsToSubmit) => {
    if (!projectId) {
      return toast.error('Please select a storage location before recording stock receipt');
    }

    if (itemsToSubmit.length === 0) {
      return toast.error('Please add at least 1 item for stock receipt');
    }

    // Validate rows (Name is required, quantity must be > 0, model is optional)
    const invalidRows = itemsToSubmit.filter(row => (!row.name && !row.sku) || !row.quantity || parseInt(row.quantity, 10) <= 0);
    if (invalidRows.length > 0) {
      return toast.error('Some items are missing a Name/SKU or have an invalid quantity');
    }

    try {
      setIsSubmitting(true);

      // Resolve or auto-create items in public.items directly
      const payloadItems = [];
      for (const row of itemsToSubmit) {
        const normSku = (row.sku || '').trim().toLowerCase();
        const normName = (row.name || '').trim().toLowerCase();

        // 1. Check existing items in database state
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
              name: row.name || row.sku || 'New Stock Item',
              sku: row.sku || null,
              model: row.model || null,
              unit: t('common.defaultUnit', 'ชิ้น'),
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
          delivery_to: row.delivery_to || null,
          serial_number: row.serial_number || null,
          part_number: row.part_number || null,
          notes: row.notes || null,
          unit_price: row.unit_price ? parseFloat(row.unit_price) : 0
        });
      }

      // Call Supabase RPC process_stock_in with fallback to direct database insert
      let orderId = null;
      const { data, error: rpcError } = await supabase.rpc('process_stock_in', {
        p_project_id: projectId,
        p_supplier: formData.supplier || null,
        p_po_number: formData.po_number || null,
        p_notes: formData.notes || null,
        p_items: payloadItems
      });

      if (!rpcError && (data?.success || data?.order_id || data?.id)) {
        orderId = data?.order_id || data?.id;
      } else {
        console.warn('process_stock_in RPC error or schema mismatch, executing direct database fallback:', rpcError?.message || rpcError);

        // Direct database insert matching exact active schema
        const { data: orderData, error: orderErr } = await supabase
          .from('stock_in_orders')
          .insert({
            project_id: projectId,
            received_date: new Date().toISOString().split('T')[0],
            created_by: user?.id || null,
            notes: formData.notes || null,
            supplier: formData.supplier || null,
            po_number: formData.po_number || null
          })
          .select()
          .single();

        if (orderErr) throw orderErr;
        orderId = orderData.id;

        const inItems = payloadItems.map(item => ({
          order_id: orderId,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price || 0,
          delivery_to: item.delivery_to || null,
          serial_number: item.serial_number || null,
          part_number: item.part_number || null,
          model: item.model || null,
          item_type: item.item_type || 'PARENT',
          parent_id: item.parent_id || null,
          parent_sku: item.parent_sku || null,
          seq_no: item.seq_no || null,
          notes: item.notes || null
        }));

        const { error: itemsErr } = await supabase
          .from('stock_in_items')
          .insert(inItems);

        if (itemsErr) throw itemsErr;

        const inTransactions = payloadItems.map(item => ({
          project_id: projectId,
          item_id: item.item_id,
          quantity: item.quantity,
          transaction_type: 'stock_in',
          reference_type: 'stock_in_order',
          reference_id: orderId,
          notes: item.notes || null,
          created_by: user?.id || null
        }));

        const { error: txErr } = await supabase
          .from('stock_transactions')
          .insert(inTransactions);

        if (txErr) console.warn('Warning inserting stock_transactions:', txErr);
      }

      toast.success(t('stockIn.toasts.created'));

      dispatchStockInNotification({
        orderId: orderId,
        projectId,
        items: payloadItems,
        receivedBy: user?.user_metadata?.full_name || user?.email || 'Warehouse Admin'
      }).catch(err => console.warn('[StockIn Notification Warning]:', err));

      setIsCreateDialogOpen(false);
      setIsImportPreviewOpen(false);
      fetchData();
    } catch (error) {
      console.error('StockIn Submit Error:', error);
      toast.error(t('stockIn.toasts.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    await executeStockInSubmission(formData.project_id, lineItems);
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
      toast.error('Unable to load receipt details');
    }
  };

  // Filtered preview items for interactive preview search
  const filteredPreviewItems = useMemo(() => {
    if (!previewSearch.trim()) return previewItems;
    const q = previewSearch.toLowerCase();
    return previewItems.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.part_number && i.part_number.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q)) ||
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }, [previewItems, previewSearch]);

  // Calculations
  const totalItemsCount = lineItems.length;
  const totalQuantitySum = lineItems.reduce((acc, row) => acc + (parseInt(row.quantity, 10) || 0), 0);

  const previewParentCount = previewItems.filter(i => i.item_type === 'PARENT').length;
  const previewChildCount = previewItems.filter(i => i.item_type === 'CHILD').length;
  const previewTotalQty = previewItems.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="w-7 h-7 text-green-500" />
            <span>{t('stockIn.title', 'Stock Receipts')}</span>
          </h2>
          <p className="text-muted-foreground mt-2">
            {t('stockIn.subtitle', 'History and records of incoming project materials')}
          </p>
        </div>
        
        {can('stock_in.create') && (
          <div className="flex items-center gap-2.5">
            <input 
              type="file" 
              ref={fileInputRef} 
              accept=".csv" 
              className="hidden" 
              onChange={handleCsvFileUpload} 
            />
            <Button 
              variant="outline"
              className="h-9 px-3 rounded-lg font-semibold text-xs border-border hover:bg-muted text-foreground gap-1.5 cursor-pointer shadow-2xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              <span>{t('stockIn.importCsv', 'Import CSV (.csv)')}</span>
            </Button>

            <Button 
              className="h-9 px-4 rounded-lg font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
              onClick={handleOpenCreateDialog}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t('stockIn.directStockIn', 'Receive Stock')}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main Stock Receipts Table */}
      <Card className="overflow-hidden rounded-xl bg-card border border-border shadow-xs">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('stockIn.receivedDate')}</TableHead>
              <TableHead>{t('stockIn.destinationWarehouse')}</TableHead>
              <TableHead>{t('stockIn.receivedBy')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">{t('common.loading')}</TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.noData')}</TableCell></TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id} className="hover:bg-muted/20">
                  <TableCell className="text-muted-foreground font-mono">{formatI18nDate(o.created_at, 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell className="font-medium">
                    {o.projects?.project_code ? (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold mr-1.5">
                        [{o.projects.project_code}]
                      </span>
                    ) : ''}
                    {o.projects?.name}
                    {o.projects?.location && (
                      <span className="text-xs text-muted-foreground font-normal ml-2">
                        ({o.projects.location})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{o.profiles?.full_name || 'Admin User'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs font-semibold" onClick={() => viewOrderDetails(o)}>
                      {t('common.viewDetails')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ========================================================================= */}
      {/* 1. INTERACTIVE DOPA+USO CSV IMPORT PREVIEW & WAREHOUSE FILTER MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isImportPreviewOpen} onOpenChange={setIsImportPreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-6 rounded-xl bg-card border border-border shadow-xl">
          <DialogHeader className="pb-3 border-b border-border/40 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                    <span>{t('stockIn.csvImport.modalTitle')}</span>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    File: <strong className="text-foreground">{importFileName || 'CSV Document'}</strong>
                  </p>
                </div>
              </div>

              {/* Summary Badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 font-mono">
                  {t('stockIn.totalItems')}: {previewItems.length}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-500/15 text-indigo-600 border border-indigo-500/30">
                  PARENT: {previewParentCount}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-500/15 text-blue-600 border border-blue-500/30">
                  CHILD: {previewChildCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                  {t('stockIn.totalUnits')}: {formatI18nNumber(previewTotalQty)} {t('common.piece')}
                </span>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Top Toolbar: Destination Project & Storage Location Selector */}
            <div className="bg-muted/30 p-3.5 rounded-xl border border-border space-y-3">
              <ProjectLocationSelector
                projects={projects}
                value={previewProjectId}
                onChange={handlePreviewProjectChange}
                required={true}
                mode="dual"
                size="sm"
                label="1. Select Project & Storage Location"
                showSummaryCard={false}
              />

              {/* Warehouse Balance Filter Toolbar */}
              <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Filter className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t('stockIn.csvImport.detectedWarehouses')}:</span>
                  </div>
                  
                  {/* Quick Warehouse Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      size="xs"
                      variant={selectedQtySource === 'คงเหลือ' ? 'default' : 'outline'}
                      onClick={() => handleChangeQtySource('คงเหลือ')}
                      className={`h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                        selectedQtySource === 'คงเหลือ'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'border-border/60 hover:bg-muted'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>{t('stockIn.qtySourceTotal')}</span>
                    </Button>

                    {csvDetectedWarehouses.map(wh => {
                      const isSelected = selectedQtySource === wh;
                      return (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => handleChangeQtySource(wh)}
                          className={`h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                              : 'border-border/60 hover:bg-muted text-foreground'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Filter Zero Qty Toggle */}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleToggleOnlyPositive}
                  className="h-7 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  {onlyPositiveFilter ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{t('stockIn.csvImport.filterPositiveOnly')}</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t('common.all')}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Active Filter Info Banner */}
            {selectedQtySource !== 'คงเหลือ' && (
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs flex items-center justify-between gap-2 animate-in fade-in-50">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Showing items and stock balance for: <strong className="text-indigo-600 dark:text-indigo-300">{selectedQtySource}</strong></span>
                </span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                  {previewItems.length} {previewItems.length === 1 ? 'item' : 'items'} ({previewTotalQty.toLocaleString()} pcs)
                </span>
              </div>
            )}

            {/* Search Bar in Preview */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('stockIn.csvImport.searchPreviewPlaceholder')}
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />
              </div>

              <span className="text-xs text-muted-foreground">
                Showing {filteredPreviewItems.length} of {previewItems.length} items
              </span>
            </div>

            {/* Preview Items Table */}
            <div className="border border-border rounded-xl overflow-hidden shadow-xs max-h-[44vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-muted/60 sticky top-0 z-10 backdrop-blur text-xs">
                  <TableRow className="border-b">
                    <TableHead className="w-[6%] text-center">#</TableHead>
                    <TableHead className="w-[8%]">Type</TableHead>
                    <TableHead className="w-[14%]">Part No. / SKU</TableHead>
                    <TableHead className="w-[32%]">Material / Item Name</TableHead>
                    <TableHead className="w-[15%]">Model / Brand</TableHead>
                    <TableHead className="w-[10%] text-right">{t('common.quantity', 'Quantity')} ({selectedQtySource === 'คงเหลือ' ? t('common.total', 'Total') : selectedQtySource})</TableHead>
                    <TableHead className="w-[12%]">Notes</TableHead>
                    <TableHead className="w-[3%] text-center">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {filteredPreviewItems.map((item, idx) => {
                    const isChild = item.item_type === 'CHILD';

                    return (
                      <TableRow 
                        key={item.tempId || idx}
                        className={`hover:bg-muted/30 transition-colors ${isChild ? 'bg-blue-50/20 dark:bg-blue-950/10' : ''}`}
                      >
                        <TableCell className="text-center font-mono text-muted-foreground">
                          {item.no || idx + 1}
                        </TableCell>

                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isChild 
                              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200' 
                              : 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-200'
                          }`}>
                            <span>{isChild ? 'CHILD' : 'PARENT'}</span>
                            {isChild && <CornerDownRight className="w-3 h-3 text-blue-600 dark:text-blue-300 shrink-0" />}
                          </span>
                        </TableCell>

                        <TableCell className="font-mono text-muted-foreground text-[11px]">
                          {item.part_number || item.sku || '—'}
                        </TableCell>

                        <TableCell className={isChild ? 'pl-6' : ''}>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              {isChild && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0 select-none" />}
                              <span className={`font-semibold ${isChild ? 'text-blue-950 dark:text-blue-200' : 'text-foreground'}`}>
                                {item.name}
                              </span>
                            </div>
                            {item.parent_sku && isChild && (
                              <div className="text-[10px] text-muted-foreground font-mono pl-3">
                                Parent: {item.parent_sku}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {item.model || '—'}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          +{item.quantity}
                        </TableCell>

                        <TableCell className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          {item.notes || '—'}
                        </TableCell>

                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewItems(prev => prev.filter(x => x.tempId !== item.tempId))}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between border-t border-border/40 pt-3 shrink-0">
            <Button 
              type="button" 
              variant="outline" 
              className="rounded-lg h-9 px-4 text-xs font-semibold cursor-pointer"
              onClick={() => setIsImportPreviewOpen(false)}
            >
              {t('common.cancel')}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleApplyPreviewToForm}
                className="rounded-lg h-9 px-4 text-xs font-semibold gap-1.5 border-border text-foreground hover:bg-muted cursor-pointer"
              >
                <span>{t('common.edit')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>

              <Button
                type="button"
                disabled={isSubmitting || !previewProjectId || previewItems.length === 0}
                onClick={handleDirectSubmitFromPreview}
                className="rounded-lg h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('stockIn.toasts.submitting')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('stockIn.csvImport.importBtn', { count: previewItems.length })}</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. DIRECT STOCK RECEIPT EDIT / MANUAL ENTRY MODAL */}
      {/* ========================================================================= */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6 rounded-xl bg-card border border-border shadow-xl">
          <form onSubmit={handleSubmitOrder}>
            <DialogHeader className="border-b border-border/40 pb-3">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
                <span>Direct Stock Receipt (Parent/Child Hierarchy)</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Destination Project & Storage Location Selection */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-3">
                <ProjectLocationSelector
                  projects={projects}
                  value={formData.project_id}
                  onChange={handleDirectProjectChange}
                  required={true}
                  mode="dual"
                  label="Project & Storage Location"
                  showSummaryCard={true}
                />

                {/* CSV Detected Warehouse Balance Selector (If CSV has been imported) */}
                {csvDetectedWarehouses.length > 0 && (
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap text-xs">
                    <span className="font-bold text-muted-foreground flex items-center gap-1">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Quick filter by file warehouse:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          const allAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, 'คงเหลือ', { filterZeroQty: false });
                          setLineItems(allAgg);
                          toast.success('Showing total balance across all warehouses');
                        }}
                        className="h-6 text-[10px] rounded-lg font-bold flex items-center gap-1"
                      >
                        <BarChart3 className="w-3 h-3 text-emerald-600" />
                        <span>Total Balance</span>
                      </Button>
                      {csvDetectedWarehouses.map(wh => (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const whAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, wh, { filterZeroQty: true });
                            setLineItems(whAgg);
                            toast.success(`Filtered for [${wh}]: ${whAgg.length} item(s)`);
                          }}
                          className="h-6 text-[10px] rounded-lg font-bold border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1"
                        >
                          <Building2 className="w-3 h-3 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CSV Tools Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <div className="flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-200">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">Import CSV with Parent-Child structure or multi-warehouse columns (UTF-8 BOM)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    className="h-8 text-xs gap-1 border-emerald-500/30 hover:bg-emerald-500/10 font-bold"
                    onClick={handleDownloadCsvTemplate}
                  >
                    <Download className="w-3.5 h-3.5" /> Download CSV Template
                  </Button>
                  
                  <Button 
                    type="button" 
                    size="sm"
                    className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" /> Import CSV File
                  </Button>
                </div>
              </div>

              {/* Dynamic Line Items Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    Incoming Material Items ({lineItems.length} {lineItems.length === 1 ? 'item' : 'items'})
                  </h3>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs gap-1.5 px-3 rounded-lg text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10 font-bold shadow-2xs cursor-pointer"
                      onClick={() => handleAddLineItem('PARENT')}
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Add Parent Item</span>
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs gap-1.5 px-3 rounded-lg text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/10 font-bold shadow-2xs cursor-pointer"
                      onClick={() => {
                        const lastParent = lineItems.slice().reverse().find(i => i.item_type === 'PARENT');
                        handleAddLineItem('CHILD', lastParent?.sku || '');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Add Child Item</span>
                    </Button>
                  </div>
                </div>

                <div className="border border-border rounded-xl overflow-x-auto shadow-xs max-h-[44vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
                      <TableRow className="text-xs">
                        <TableHead className="w-[8%] min-w-[75px]">Type</TableHead>
                        <TableHead className="w-[10%] min-w-[100px]">Item SKU</TableHead>
                        <TableHead className="w-[9%] min-w-[95px]">Parent SKU</TableHead>
                        <TableHead className="w-[20%] min-w-[160px]">Item Name *</TableHead>
                        <TableHead className="w-[12%] min-w-[110px]">Model / Brand</TableHead>
                        <TableHead className="w-[7%] min-w-[65px] text-center">Quantity *</TableHead>
                        <TableHead className="w-[10%] min-w-[95px]">S/N</TableHead>
                        <TableHead className="w-[10%] min-w-[95px]">Part No.</TableHead>
                        <TableHead className="w-[10%] min-w-[110px]">Notes</TableHead>
                        <TableHead className="w-[4%] min-w-[45px] text-center">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-6 text-muted-foreground text-sm">
                            No items added yet. Click &quot;+ Add Parent Item&quot; or import a CSV file
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
                                  className={`h-9 w-full rounded-lg border px-1 text-[11px] font-bold ${isChild ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200'}`}
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
                                  className="h-9 text-xs font-mono font-semibold rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder={isChild ? "Parent SKU" : "-"} 
                                  disabled={!isChild}
                                  value={row.parent_sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'parent_sku', e.target.value)} 
                                  className="h-9 text-xs font-mono disabled:opacity-40 rounded-lg"
                                />
                              </TableCell>

                              <TableCell className={`align-top ${isChild ? 'pl-6' : ''}`}>
                                <div className="flex items-center gap-1">
                                  {isChild && <span className="text-blue-500 font-mono text-xs select-none">└─</span>}
                                  <Input 
                                    required
                                    placeholder={isChild ? "Enter child item name" : "Enter item name"} 
                                    value={row.name} 
                                    onChange={e => handleUpdateLineItem(row.tempId, 'name', e.target.value)} 
                                    className={`h-9 text-xs rounded-lg ${isChild ? 'font-medium text-blue-950 dark:text-blue-200' : 'font-semibold'}`}
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Model (optional)" 
                                  value={row.model} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'model', e.target.value)} 
                                  className="h-9 text-xs font-medium rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  type="number" 
                                  min="1" 
                                  required 
                                  value={row.quantity ?? ''} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'quantity', e.target.value)} 
                                  className="h-9 text-center text-xs font-bold px-1 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="S/N (optional)" 
                                  value={row.serial_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'serial_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Part No." 
                                  value={row.part_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'part_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Notes" 
                                  value={row.notes} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'notes', e.target.value)} 
                                  className="h-9 text-xs rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top text-center">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
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
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border text-sm">
                <div className="flex gap-6 text-xs sm:text-sm font-medium flex-wrap">
                  <span>Total Items: <strong className="text-foreground font-bold">{totalItemsCount}</strong></span>
                  <span>Parent Items: <strong className="text-green-600 font-bold">{lineItems.filter(i => i.item_type === 'PARENT').length}</strong></span>
                  <span>Child Items: <strong className="text-blue-600 font-bold">{lineItems.filter(i => i.item_type === 'CHILD').length}</strong></span>
                  <span>Total Quantity: <strong className="text-emerald-600 font-bold">{totalQuantitySum}</strong> pcs</span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting} className="rounded-lg h-9 px-4 text-xs font-semibold">
                {t('common.cancel')}
              </Button>
              <Button 
                type="submit" 
                className="h-9 px-4 rounded-lg font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={isSubmitting || !formData.project_id || lineItems.some(i => (!i.name && !i.sku))}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                    <span>{t('stockIn.toasts.submitting')}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{t('stockIn.completeStockIn')}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. ORDER DETAILS DIALOG */}
      {/* ========================================================================= */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-xl bg-card border border-border shadow-xl">
          <DialogHeader className="pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <span>Stock Receipt Details</span>
              </DialogTitle>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                Parent/Child Hierarchy
              </span>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Metadata Summary Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-muted/30 p-4 rounded-xl border border-border">
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium block">Storage Location</span>
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
                <span className="text-muted-foreground font-medium block">Recorded By</span>
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {(selectedOrder?.profiles?.full_name || 'A')[0].toUpperCase()}
                  </div>
                  {selectedOrder?.profiles?.full_name || 'Admin User'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium block">Receipt Date</span>
                <span className="font-semibold font-mono text-foreground block">
                  {selectedOrder && format(new Date(selectedOrder.created_at), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
            </div>
            
            {/* Items Summary Header */}
            <div className="flex items-center justify-between pt-1">
              <h4 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Package className="w-4 h-4 text-emerald-500" />
                <span>Items in this Receipt ({orderDetails.length} {orderDetails.length === 1 ? 'item' : 'items'})</span>
              </h4>
              <span className="text-xs text-muted-foreground font-mono">
                Total Quantity: {orderDetails.reduce((sum, item) => sum + (item.quantity || 0), 0)} pcs
              </span>
            </div>

            {/* Scrollable Items Table */}
            <div className="border border-border rounded-xl overflow-hidden shadow-xs max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-muted/60 sticky top-0 z-10 backdrop-blur text-xs">
                  <TableRow className="border-b">
                    <TableHead className="w-[10%] font-bold">Type</TableHead>
                    <TableHead className="w-[38%] font-bold">SKU / Material Name</TableHead>
                    <TableHead className="w-[15%] font-bold">Model</TableHead>
                    <TableHead className="w-[10%] text-right font-bold">Quantity</TableHead>
                    <TableHead className="w-[8%] font-bold">Unit</TableHead>
                    <TableHead className="w-[19%] font-bold">S/N & Part No. / Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orderDetails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No items found in this receipt
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
                            {item.items?.unit || t('common.defaultUnit', 'ชิ้น')}
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
              className="h-9 px-5 rounded-lg text-xs font-semibold hover:bg-muted cursor-pointer"
              onClick={() => setSelectedOrder(null)}
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockIn;
