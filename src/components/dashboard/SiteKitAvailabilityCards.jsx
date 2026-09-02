import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Router, Antenna, 
  AlertTriangle, CheckCircle2, Layers, 
  ChevronRight, AlertCircle, Edit3, PenLine, Plus, 
  Trash2, RotateCcw, Save, Search, 
  Package, ShieldCheck, Check, Info
} from 'lucide-react';
import MicrowaveAntennaIcon from '@/components/icons/MicrowaveAntennaIcon';
import BaseStationTowerIcon from '@/components/icons/BaseStationTowerIcon';
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogDescription 
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { 
  saveCategoryBom, 
  resetCategoryBomToDefault, 
  fetchMasterCatalogItems 
} from '@/lib/siteKits';

const CATEGORY_ICONS = {
  '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba': MicrowaveAntennaIcon,
  '793d55c3-4750-42e1-a82e-438e7be131c8': BaseStationTowerIcon,
  '3fb47021-6c65-4a4f-bca4-595280d9ba97': Router,
  '823af00d-99b0-4d9a-943b-0ae29bc83ff0': Antenna,
};

const CATEGORY_GRADIENTS = {
  '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba': 'from-blue-600/15 via-blue-500/5 to-transparent border-blue-500/30 text-blue-700 dark:text-blue-400',
  '793d55c3-4750-42e1-a82e-438e7be131c8': 'from-emerald-600/15 via-emerald-500/5 to-transparent border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
  '3fb47021-6c65-4a4f-bca4-595280d9ba97': 'from-indigo-600/15 via-indigo-500/5 to-transparent border-indigo-500/30 text-indigo-700 dark:text-indigo-400',
  '823af00d-99b0-4d9a-943b-0ae29bc83ff0': 'from-amber-600/15 via-amber-500/5 to-transparent border-amber-500/30 text-amber-700 dark:text-amber-400',
};

const COMMON_UNITS = ['ชิ้น', 'ชุด', 'เมตร', 'ลูก', 'ต้น', 'เครื่อง', 'กล่อง', 'ม้วน', 'แพ็ค'];

const SiteKitAvailabilityCards = ({ siteKits = [], loading = false, onRefresh }) => {
  const { isAdmin, can } = useAuth();
  const canEditBom = isAdmin || can('roles.manage_permissions') || can('items.update');

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [bomDraft, setBomDraft] = useState([]);
  const [masterItems, setMasterItems] = useState([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [searchCatalogQuery, setSearchCatalogQuery] = useState('');
  const [catalogPickerTargetIndex, setCatalogPickerTargetIndex] = useState(null);
  const [bomView, setBomView] = useState('complete');

  // Helpers for mutual exclusivity between Complete Set and Spare Equipment
  const isSpareItem = (item) => item.is_mandatory === false || item.notes === 'spare';
  const isCompleteSetItem = (item) => !isSpareItem(item);

  // Initialize draft when category is selected
  useEffect(() => {
    if (selectedCategory) {
      const initialDraft = (selectedCategory.items || []).map((item, idx) => {
        const isSpare = item.is_mandatory === false || item.notes === 'spare';
        return {
          po_seq: item.po_seq || idx + 1,
          part_number: item.part_number || '',
          item_name: item.bom_name || '',
          item_id: item.item_id || null,
          qty_per_site: item.qty_per_site || 1,
          unit: item.unit || 'ชิ้น',
          is_mandatory: !isSpare,
          notes: item.notes || (isSpare ? 'spare' : '')
        };
      });
      setBomDraft(initialDraft);
      setCatalogPickerTargetIndex(null);
    }
  }, [selectedCategory?.category_id, selectedCategory?.total_items_in_bom]);

  // Sync selectedCategory with fresh siteKits from parent onRefresh
  useEffect(() => {
    if (selectedCategory && !isEditing) {
      const updatedCat = siteKits.find(c => c.category_id === selectedCategory.category_id);
      if (updatedCat) {
        setSelectedCategory(prev => prev ? { ...prev, ...updatedCat } : null);
      }
    }
  }, [siteKits, isEditing]);

  // Load master catalog items when modal opens
  useEffect(() => {
    if (selectedCategory && canEditBom && masterItems.length === 0) {
      setLoadingMaster(true);
      fetchMasterCatalogItems()
        .then(data => setMasterItems(data))
        .catch(err => console.error('Failed to load master items catalog:', err))
        .finally(() => setLoadingMaster(false));
    }
  }, [selectedCategory, canEditBom, masterItems.length]);

  // Filtered master catalog items for picker modal
  const filteredCatalogItems = useMemo(() => {
    if (!searchCatalogQuery.trim()) return masterItems.slice(0, 30);
    const q = searchCatalogQuery.toLowerCase().trim();
    return masterItems.filter(item => 
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [masterItems, searchCatalogQuery]);

  const handleAddRow = (isSpareContext = false) => {
    setBomDraft(prev => [
      ...prev,
      {
        po_seq: prev.length + 1,
        part_number: '',
        item_name: '',
        item_id: null,
        qty_per_site: 1,
        unit: 'ชิ้น',
        is_mandatory: !isSpareContext,
        notes: isSpareContext ? 'spare' : ''
      }
    ]);
  };

  const getRowSpareMetrics = (item) => {
    const previous = (selectedCategory?.items || []).find(p => 
      (item.item_id && p.item_id === item.item_id) || 
      (item.part_number && p.part_number === item.part_number) ||
      p.bom_name === item.item_name
    );
    const masterItem = masterItems.find(m => m.id === item.item_id || (item.part_number && m.sku === item.part_number));
    const stock = previous?.total_stock !== undefined ? previous.total_stock : (masterItem?.total_stock || 0);
    const isSpare = item.is_mandatory === false || item.notes === 'spare';
    const completeSets = Number(selectedCategory?.complete_sets) || 0;
    const qtyPerSite = Number(item.qty_per_site) || 0;
    const allocatedStock = isSpare ? 0 : (completeSets * qtyPerSite);
    const spareStock = isSpare ? stock : Math.max(stock - allocatedStock, 0);
    return { stock, allocatedStock, spareStock };
  };

  const handleRemoveRow = (index) => {
    setBomDraft(prev => {
      const updated = prev.filter((_, idx) => idx !== index);
      return updated.map((item, idx) => ({ ...item, po_seq: idx + 1 }));
    });
  };

  const handleFieldChange = (index, field, value) => {
    setBomDraft(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleToggleSection = (index) => {
    setBomDraft(prev => {
      const updated = [...prev];
      const current = updated[index];
      const currentlySpare = current.is_mandatory === false || current.notes === 'spare';
      const willBeSpare = !currentlySpare;
      
      updated[index] = {
        ...current,
        is_mandatory: !willBeSpare,
        notes: willBeSpare ? 'spare' : ''
      };

      toast.info(
        willBeSpare
          ? `ย้าย "${current.item_name || 'รายการ'}" ไปยัง Spare Equipment แล้ว`
          : `ย้าย "${current.item_name || 'รายการ'}" ไปยัง Complete Set แล้ว`
      );

      return updated;
    });
  };

  const handleSelectMasterItem = (item) => {
    if (catalogPickerTargetIndex === null) return;
    setBomDraft(prev => {
      const targetIsSpare = bomView === 'spare' || prev[catalogPickerTargetIndex]?.is_mandatory === false || prev[catalogPickerTargetIndex]?.notes === 'spare';

      // Find if this item already exists in ANY other row in the draft
      const duplicateIndex = prev.findIndex((d, idx) => 
        idx !== catalogPickerTargetIndex && (
          (item.id && d.item_id === item.id) ||
          (item.sku && d.part_number && d.part_number.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
          (d.item_name && d.item_name.trim().toLowerCase() === item.name.trim().toLowerCase())
        )
      );

      let updated = [...prev];
      if (duplicateIndex !== -1) {
        // Automatically remove the duplicate from the other section to enforce mutual exclusion
        updated.splice(duplicateIndex, 1);
        const adjustedTargetIndex = duplicateIndex < catalogPickerTargetIndex ? catalogPickerTargetIndex - 1 : catalogPickerTargetIndex;
        updated[adjustedTargetIndex] = {
          ...updated[adjustedTargetIndex],
          item_id: item.id,
          item_name: item.name,
          part_number: item.sku || '',
          unit: item.unit || updated[adjustedTargetIndex]?.unit || 'ชิ้น',
          is_mandatory: !targetIsSpare,
          notes: targetIsSpare ? 'spare' : ''
        };
      } else {
        updated[catalogPickerTargetIndex] = {
          ...updated[catalogPickerTargetIndex],
          item_id: item.id,
          item_name: item.name,
          part_number: item.sku || '',
          unit: item.unit || updated[catalogPickerTargetIndex]?.unit || 'ชิ้น',
          is_mandatory: !targetIsSpare,
          notes: targetIsSpare ? 'spare' : ''
        };
      }

      return updated.map((it, idx) => ({ ...it, po_seq: idx + 1 }));
    });

    setCatalogPickerTargetIndex(null);
    setSearchCatalogQuery('');
    toast.success(
      bomView === 'spare'
        ? `เลือก "${item.name}" เป็น Spare Equipment (ตัดออกจาก Complete Set อัตโนมัติ)`
        : `เลือก "${item.name}" เป็น Complete Set (ตัดออกจาก Spare Equipment อัตโนมัติ)`
    );
  };

  const handleSaveBom = async () => {
    if (!selectedCategory) return;
    if (!canEditBom) {
      toast.error('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขสเปก BOM ได้');
      return;
    }

    // Validation
    const invalidItems = bomDraft.filter(i => !i.item_name || !i.item_name.trim());
    if (invalidItems.length > 0) {
      toast.error('กรุณาระบุชื่อรายการอุปกรณ์ให้ครบทุกแถว หรือลบแถวที่ว่างออก');
      return;
    }

    const invalidQty = bomDraft.filter(i => i.qty_per_site === undefined || i.qty_per_site === null || Number(i.qty_per_site) < 0);
    if (invalidQty.length > 0) {
      toast.error('จำนวนที่ใช้ต่อไซต์ต้องไม่ติดลบ (>= 0)');
      return;
    }

    // Enforce mutual exclusion & deduplication before saving
    const cleanBomDraft = [];
    const seen = new Set();
    for (let i = bomDraft.length - 1; i >= 0; i--) {
      const item = bomDraft[i];
      const key = item.item_id || `${(item.item_name || '').trim().toLowerCase()}_${(item.part_number || '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleanBomDraft.unshift(item);
      }
    }

    try {
      setSaving(true);
      await saveCategoryBom(selectedCategory.category_id, cleanBomDraft);
      toast.success(`บันทึกสเปก BOM สำหรับ ${selectedCategory.category_name} เรียบร้อยแล้ว`);
      setIsEditing(false);

      // Keep the dialog in sync so the new BOM items and Spare Equipment are visible immediately.
      setSelectedCategory(prev => {
        if (!prev) return null;
        const updatedItems = cleanBomDraft.map((item, idx) => {
          const previous = (prev.items || []).find(p => 
            (item.item_id && p.item_id === item.item_id) || 
            (item.part_number && p.part_number === item.part_number) ||
            p.bom_name === item.item_name
          ) || {};
          const masterItem = masterItems.find(m => m.id === item.item_id || (item.part_number && m.sku === item.part_number));
          const totalStock = previous.total_stock !== undefined ? previous.total_stock : (masterItem?.total_stock || 0);
          const qtyPerSite = Number(item.qty_per_site) || 1;
          const setsPossible = Math.floor(totalStock / qtyPerSite);
          const isSpare = item.is_mandatory === false || item.notes === 'spare';

          return {
            ...previous,
            item_id: item.item_id || previous.item_id || null,
            po_seq: idx + 1,
            part_number: item.part_number || '',
            bom_name: item.item_name,
            qty_per_site: qtyPerSite,
            unit: item.unit || 'ชิ้น',
            is_mandatory: !isSpare,
            notes: item.notes || (isSpare ? 'spare' : ''),
            total_stock: totalStock,
            sets_possible: setsPossible
          };
        });

        let minSets = Infinity;
        updatedItems.forEach(i => {
          if (i.is_mandatory && i.notes !== 'spare' && i.sets_possible < minSets) {
            minSets = i.sets_possible;
          }
        });
        if (minSets === Infinity) minSets = 0;

        return {
          ...prev,
          is_customized: true,
          complete_sets: minSets,
          total_items_in_bom: updatedItems.length,
          items: updatedItems
        };
      });

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error saving BOM:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึก BOM');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!selectedCategory) return;
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการคืนค่าสเปก BOM ของ "${selectedCategory.category_name}" กลับเป็นค่ามาตรฐานจากโรงงาน?`)) {
      return;
    }

    try {
      setResetting(true);
      await resetCategoryBomToDefault(selectedCategory.category_id);
      toast.success(`คืนค่าเริ่มต้นสำหรับ ${selectedCategory.category_name} สำเร็จ`);
      setIsEditing(false);

      if (onRefresh) {
        await onRefresh();
      }
      setSelectedCategory(null);
    } catch (error) {
      console.error('Error resetting BOM to default:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการคืนค่าเริ่มต้น');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-56 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 rounded-3xl bg-muted/50 border border-border/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!siteKits || siteKits.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold tracking-tight text-foreground">
              ความพร้อมชุดติดตั้งสถานี (Site Installation Kits BOM)
            </h3>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-semibold">
              Real-time BOM
            </Badge>
            {canEditBom && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px] font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Admin Editable</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            คำนวณจำนวนชุดที่จัดได้สมบูรณ์ตามสเปก BOM ของแต่ละไซต์งาน และแจ้งเตือนรายการที่มีสต็อกจำกัด {canEditBom ? '(ผู้ดูแลระบบสามารถคลิกเพื่อแก้ไขสเปก BOM ได้)' : ''}
          </p>
        </div>
      </div>

      {/* 4 Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {siteKits.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.category_id] || Layers;
          const isReady = cat.complete_sets > 0;
          const gradientCls = CATEGORY_GRADIENTS[cat.category_id] || 'from-primary/10 via-primary/5 to-transparent border-border/80 text-primary';

          return (
            <Card
              key={cat.category_id}
              onClick={() => setSelectedCategory(cat)}
              className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 backdrop-blur-md shadow-xs hover:shadow-md hover:border-emerald-500/40 transition-all duration-300 cursor-pointer flex flex-col justify-between"
            >
              {/* Subtle top color gradient accent */}
              <div className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${isReady ? 'from-emerald-500 to-teal-400' : 'from-rose-500 to-amber-500'}`} />

              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center bg-gradient-to-br ${gradientCls} border shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-sm font-bold truncate text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {cat.category_name}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                        <span>BOM {cat.total_items_in_bom || cat.items?.length || 0} รายการ</span>
                        {cat.is_customized && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">• ปรับแต่งแล้ว</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Complete Sets Badge */}
                  <div className="shrink-0 text-right">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${
                      isReady 
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40' 
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40'
                    }`}>
                      {isReady ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span>{cat.complete_sets} ชุด</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                {/* Bottleneck Summary Box */}
                <div className="rounded-2xl p-2.5 bg-muted/40 border border-border/50 text-[11px] space-y-1.5 min-h-[58px]">
                  <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <AlertCircle className={`w-3.5 h-3.5 ${isReady ? 'text-amber-500' : 'text-rose-500'}`} />
                    <span>{isReady ? 'สต็อกจำกัดสำหรับชุดถัดไป:' : 'สต็อกจำกัด (ยังจัดชุดไม่ได้):'}</span>
                  </div>
                  <div className="text-foreground font-medium line-clamp-2 leading-relaxed">
                    {cat.bottlenecks && cat.bottlenecks.length > 0 ? (
                      cat.bottlenecks.slice(0, 2).join(', ') + (cat.bottlenecks.length > 2 ? ` (+อีก ${cat.bottlenecks.length - 2} รายการ)` : '')
                    ) : (
                      'พร้อมจัดชุดทุกรายการ'
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground pt-1 border-t border-border/40 group-hover:text-foreground transition-colors">
                  <span>{canEditBom ? 'ดูสเปก / แก้ไข BOM' : 'ดูสเปกและสต็อก BOM'}</span>
                  <div className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <span>{canEditBom ? 'จัดการ' : 'เปิดดู'}</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed BOM Breakdown & Admin Editor Dialog Modal */}
      <Dialog open={!!selectedCategory} onOpenChange={(open) => {
        if (!open) {
          setSelectedCategory(null);
          setIsEditing(false);
          setCatalogPickerTargetIndex(null);
          setBomView('complete');
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  {selectedCategory && (
                    React.createElement(CATEGORY_ICONS[selectedCategory.category_id] || Layers, { className: 'w-5 h-5' })
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {selectedCategory?.category_name}
                    </DialogTitle>
                    {isEditing ? (
                      <Badge className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                        {bomView === 'spare' ? 'โหมดแก้ไข Spare Equipment (Admin)' : 'โหมดแก้ไข BOM (Admin)'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                        จัดได้ {selectedCategory?.complete_sets} ชุดสมบูรณ์
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {isEditing 
                      ? (bomView === 'spare' 
                          ? 'ปรับแต่งรายการอุปกรณ์สำรอง เพิ่มรายการใหม่ และเงื่อนไขการจัดสรร' 
                          : 'ปรับแต่งรายการวัสดุที่ใช้ในชุดติดตั้ง สเปกจำนวน และเงื่อนไขความจำเป็นต่อชุด')
                      : (bomView === 'spare'
                          ? 'รายการอุปกรณ์และสต็อกสำรองคงเหลือที่จัดชุดแล้ว'
                          : 'เทียบยอดคงเหลือสต็อกจริงกับจำนวนที่ต้องใช้ต่อ 1 ไซต์งาน')}
                  </DialogDescription>
                </div>
              </div>

              {/* Action Buttons in Header */}
              <div className="flex items-center gap-2 shrink-0">
                {canEditBom && !isEditing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="rounded-xl h-9 px-3 gap-1.5 text-xs font-bold border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 cursor-pointer shadow-2xs"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>{bomView === 'spare' ? 'Edit Spare Equipment' : 'Edit BOM Specification'}</span>
                  </Button>
                )}

                {isEditing && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resetting || saving}
                      onClick={handleResetDefault}
                      className="rounded-xl h-9 px-3 gap-1.5 text-xs font-bold text-muted-foreground hover:text-rose-600 border-border/80 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                      <span>คืนค่าเริ่มต้น</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setIsEditing(false)}
                      className="rounded-xl h-9 px-3 text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
                    >
                      <span>ยกเลิก</span>
                    </Button>

                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={handleSaveBom}
                      className="rounded-xl h-9 px-4 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm"
                    >
                      <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                      <span>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Navigation Tabs (Accessible in both View and Edit modes) */}
          <div className="px-6 pt-3">
            <div
              role="tablist"
              aria-label="BOM inventory views"
              className="flex w-full border-b border-border/60"
            >
              <button
                type="button"
                role="tab"
                aria-selected={bomView === 'complete'}
                onClick={() => setBomView('complete')}
                className={`relative flex-1 px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  bomView === 'complete'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Complete Set
                {bomView === 'complete' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-600 dark:bg-emerald-400" />
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bomView === 'spare'}
                onClick={() => setBomView('spare')}
                className={`relative flex-1 px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  bomView === 'spare'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Spare Equipment
                {bomView === 'spare' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-600 dark:bg-emerald-400" />
                )}
              </button>
            </div>
          </div>

          {/* Dialog Body */}
          <div className="flex-1 overflow-y-auto p-6 pt-3 space-y-4">
            {isEditing && bomView === 'complete' ? (
              /* =======================================================
               * ADMIN EDITABLE COMPLETE SET BOM FORM VIEW
               * ======================================================= */
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 px-4 text-xs text-blue-800 dark:text-blue-300">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>
                      รายการวัสดุสำหรับชุดติดตั้งสมบูรณ์ (Complete Set) หากย้ายรายการใดไป Spare Equipment รายการนั้นจะถูกตัดออกจากชุดติดตั้งอัตโนมัติ
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddRow(false)}
                    className="rounded-xl h-8 px-3 gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มรายการ Complete Set</span>
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/70 overflow-hidden shadow-2xs bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                        <th className="py-2.5 px-3 min-w-[200px]">รายการอุปกรณ์ใน Complete Set / Part Number</th>
                        <th className="py-2.5 px-3 text-center w-28">ใช้ต่อไซต์</th>
                        <th className="py-2.5 px-3 text-center w-28">หน่วยนับ</th>
                        <th className="py-2.5 px-3 text-center w-32">หมวดหมู่ชุด</th>
                        <th className="py-2.5 px-3 text-center w-14">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {bomDraft
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(({ item }) => isCompleteSetItem(item))
                        .map(({ item, originalIndex }, displayIdx) => (
                          <tr key={originalIndex} className="hover:bg-muted/30 transition-colors">
                            {/* Sequence */}
                            <td className="py-2 px-3 text-center font-bold text-muted-foreground">
                              {displayIdx + 1}
                            </td>

                            {/* Item Name & Part Selector */}
                            <td className="py-2 px-3 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={item.item_name}
                                  onChange={(e) => handleFieldChange(originalIndex, 'item_name', e.target.value)}
                                  placeholder="ระบุชื่ออุปกรณ์ หรือเลือกจากคลัง..."
                                  className="h-8 text-xs font-semibold rounded-lg bg-background"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCatalogPickerTargetIndex(originalIndex);
                                    setSearchCatalogQuery(item.item_name || '');
                                  }}
                                  title="เลือกจากรายการวัสดุในคลัง (Master Catalog)"
                                  className="h-8 px-2.5 gap-1 text-[11px] font-bold rounded-lg border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 shrink-0 cursor-pointer"
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  <span>เลือกจากคลัง</span>
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Part Number / SKU:</span>
                                <Input
                                  value={item.part_number}
                                  onChange={(e) => handleFieldChange(originalIndex, 'part_number', e.target.value)}
                                  placeholder="เช่น 30207-0024-XXXXX"
                                  className="h-6 text-[11px] font-mono rounded-md bg-muted/30"
                                />
                              </div>
                            </td>

                            {/* Quantity per site */}
                            <td className="py-2 px-3 text-center">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.qty_per_site}
                                onChange={(e) => handleFieldChange(originalIndex, 'qty_per_site', e.target.value)}
                                className="h-8 text-xs text-center font-bold rounded-lg w-20 mx-auto bg-background"
                              />
                            </td>

                            {/* Unit */}
                            <td className="py-2 px-3 text-center">
                              <Input
                                value={item.unit}
                                onChange={(e) => handleFieldChange(originalIndex, 'unit', e.target.value)}
                                placeholder="ชิ้น"
                                list={`unit-list-${originalIndex}`}
                                className="h-8 text-xs text-center font-medium rounded-lg w-20 mx-auto bg-background"
                              />
                              <datalist id={`unit-list-${originalIndex}`}>
                                {COMMON_UNITS.map(u => (
                                  <option key={u} value={u} />
                                ))}
                              </datalist>
                            </td>

                            {/* Move to Spare Toggle */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleSection(originalIndex)}
                                title="คลิกเพื่อย้ายไปแท็บ Spare Equipment (ตัดออกจาก Complete Set)"
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-sky-500/20 hover:text-sky-700"
                              >
                                Complete Set
                              </button>
                            </td>

                            {/* Delete */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(originalIndex)}
                                title="ลบรายการนี้"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {bomDraft.filter(isCompleteSetItem).length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      ยังไม่มีรายการใน Complete Set
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddRow(false)}
                    className="rounded-xl h-8 px-3 gap-1.5 text-xs font-bold border-dashed border-border/80 hover:border-emerald-500/60 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มรายการอุปกรณ์ใน Complete Set</span>
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Complete Set มีทั้งหมด {bomDraft.filter(isCompleteSetItem).length} รายการ
                  </span>
                </div>
              </div>
            ) : isEditing && bomView === 'spare' ? (
              /* =======================================================
               * ADMIN EDITABLE SPARE EQUIPMENT FORM VIEW
               * ======================================================= */
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 px-4 text-xs text-blue-800 dark:text-blue-300">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>
                      รายการอุปกรณ์สำรอง (Spare Equipment) จะถูกแยกออกจาก Complete Set โดยอัตโนมัติ และไม่ถูกนำไปเป็นตัวจำกัดจำนวนชุดติดตั้ง
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddRow(true)}
                    className="rounded-xl h-8 px-3 gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่ม Spare Equipment</span>
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/70 overflow-hidden shadow-2xs bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                        <th className="py-2.5 px-3 min-w-[200px]">รายการอุปกรณ์ใน Spare / Part Number</th>
                        <th className="py-2.5 px-3 text-center w-24">สเปกต่อไซต์</th>
                        <th className="py-2.5 px-3 text-center w-24">หน่วยนับ</th>
                        <th className="py-2.5 px-3 text-center w-32">หมวดหมู่ชุด</th>
                        <th className="py-2.5 px-3 text-center w-28">สต็อก / Spare</th>
                        <th className="py-2.5 px-3 text-center w-12">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {bomDraft
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(({ item }) => isSpareItem(item))
                        .map(({ item, originalIndex }, displayIdx) => {
                          const { stock, spareStock } = getRowSpareMetrics(item);
                          return (
                            <tr key={originalIndex} className="hover:bg-muted/30 transition-colors">
                              {/* Sequence */}
                              <td className="py-2 px-3 text-center font-bold text-muted-foreground">
                                {displayIdx + 1}
                              </td>

                              {/* Item Name & Part Selector */}
                              <td className="py-2 px-3 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={item.item_name}
                                    onChange={(e) => handleFieldChange(originalIndex, 'item_name', e.target.value)}
                                    placeholder="ระบุชื่ออุปกรณ์ หรือเลือกจากคลัง..."
                                    className="h-8 text-xs font-semibold rounded-lg bg-background"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCatalogPickerTargetIndex(originalIndex);
                                      setSearchCatalogQuery(item.item_name || '');
                                    }}
                                    title="เลือกจากรายการวัสดุในคลัง (Master Catalog)"
                                    className="h-8 px-2.5 gap-1 text-[11px] font-bold rounded-lg border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 shrink-0 cursor-pointer"
                                  >
                                    <Package className="w-3.5 h-3.5" />
                                    <span>เลือกจากคลัง</span>
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Part Number / SKU:</span>
                                  <Input
                                    value={item.part_number}
                                    onChange={(e) => handleFieldChange(originalIndex, 'part_number', e.target.value)}
                                    placeholder="เช่น 30207-0024-XXXXX"
                                    className="h-6 text-[11px] font-mono rounded-md bg-muted/30"
                                  />
                                </div>
                              </td>

                              {/* Quantity per site */}
                              <td className="py-2 px-3 text-center">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.qty_per_site}
                                  onChange={(e) => handleFieldChange(originalIndex, 'qty_per_site', e.target.value)}
                                  className="h-8 text-xs text-center font-bold rounded-lg w-20 mx-auto bg-background"
                                />
                              </td>

                              {/* Unit */}
                              <td className="py-2 px-3 text-center">
                                <Input
                                  value={item.unit}
                                  onChange={(e) => handleFieldChange(originalIndex, 'unit', e.target.value)}
                                  placeholder="ชิ้น"
                                  list={`unit-list-spare-${originalIndex}`}
                                  className="h-8 text-xs text-center font-medium rounded-lg w-20 mx-auto bg-background"
                                />
                                <datalist id={`unit-list-spare-${originalIndex}`}>
                                  {COMMON_UNITS.map(u => (
                                    <option key={u} value={u} />
                                  ))}
                                </datalist>
                              </td>

                              {/* Move to Complete Set Toggle */}
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSection(originalIndex)}
                                  title="คลิกเพื่อย้ายไปแท็บ Complete Set (นำเข้าเป็นอุปกรณ์ชุดสมบูรณ์)"
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40 hover:bg-emerald-500/20 hover:text-emerald-700"
                                >
                                  Spare Equipment
                                </button>
                              </td>

                              {/* Live Stock & Spare Preview */}
                              <td className="py-2 px-3 text-center">
                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-semibold text-foreground">
                                    สต็อก: {stock.toLocaleString()}
                                  </div>
                                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                    spareStock > 0 
                                      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' 
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    Spare: {spareStock.toLocaleString()}
                                  </span>
                                </div>
                              </td>

                              {/* Delete */}
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(originalIndex)}
                                  title="ลบรายการนี้"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {bomDraft.filter(isSpareItem).length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      ยังไม่มีรายการใน Spare Equipment
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddRow(true)}
                    className="rounded-xl h-8 px-3 gap-1.5 text-xs font-bold border-dashed border-border/80 hover:border-emerald-500/60 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มรายการ Spare Equipment</span>
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Spare Equipment มีทั้งหมด {bomDraft.filter(isSpareItem).length} รายการ
                  </span>
                </div>
              </div>
            ) : bomView === 'complete' ? (
              /* =======================================================
               * READ-ONLY COMPLETE SET BOM BREAKDOWN VIEW
               * ======================================================= */
              <div className="rounded-2xl border border-border/70 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                      <th className="py-2.5 px-3">รายการอุปกรณ์ตาม Complete Set</th>
                      <th className="py-2.5 px-3 text-center w-24">ใช้ต่อไซต์</th>
                      <th className="py-2.5 px-3 text-center w-24">สต็อกจริง</th>
                      <th className="py-2.5 px-3 text-center w-24">จัดได้ (ชุด)</th>
                      <th className="py-2.5 px-3 text-center w-24">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(selectedCategory?.items || []).filter(isCompleteSetItem).map((item, idx) => {
                      const isLimiting = item.is_mandatory && item.sets_possible === selectedCategory.complete_sets;
                      return (
                        <tr 
                          key={item.item_id || item.po_seq || idx} 
                          className={`hover:bg-muted/30 transition-colors ${
                            isLimiting ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center font-semibold text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{item.bom_name}</div>
                            {item.part_number && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                Part: {item.part_number}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">
                            {item.qty_per_site} <span className="text-[10px] font-normal text-muted-foreground">{item.unit || 'ชิ้น'}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">
                            <span className={item.total_stock === 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
                              {item.total_stock?.toLocaleString() || 0}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-black">
                            <span className={`px-2 py-0.5 rounded-md ${
                              item.sets_possible === 0
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : isLimiting
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            }`}>
                              {item.sets_possible} ชุด
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.total_stock === 0 ? (
                              <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px]">
                                หมดสต็อก
                              </Badge>
                            ) : isLimiting ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                                สต็อกจำกัด
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                                พร้อม
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(selectedCategory?.items || []).filter(isCompleteSetItem).length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    ยังไม่มีรายการใน Complete Set
                  </div>
                )}
              </div>
            ) : (
              /* =======================================================
               * READ-ONLY SPARE EQUIPMENT VIEW
               * ======================================================= */
              <div className="rounded-2xl border border-border/70 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">No.</th>
                      <th className="py-2.5 px-3">Equipment</th>
                      <th className="py-2.5 px-3 text-center w-28">Required / site</th>
                      <th className="py-2.5 px-3 text-center w-24">Stock</th>
                      <th className="py-2.5 px-3 text-center w-32">Complete set stock</th>
                      <th className="py-2.5 px-3 text-center w-24">Spare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(selectedCategory?.items || []).filter(isSpareItem).map((item, idx) => {
                      const stock = Number(item.total_stock) || 0;
                      const qtyPerSite = Number(item.qty_per_site) || 0;
                      const allocatedStock = 0;
                      const spareStock = stock;

                      return (
                        <tr key={item.item_id || item.po_seq || idx} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 text-center font-semibold text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{item.bom_name}</div>
                            {item.part_number && (
                              <div className="text-[10px] text-muted-foreground font-mono">Part: {item.part_number}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">
                            {item.qty_per_site} <span className="text-[10px] font-normal text-muted-foreground">{item.unit || 'unit'}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">{stock.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-center text-muted-foreground">{allocatedStock.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-center font-black">
                            <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300">
                              {spareStock.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(selectedCategory?.items || []).filter(isSpareItem).length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    ยังไม่มีรายการใน Spare Equipment สำหรับหมวดหมู่นี้
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Master Inventory Catalog Picker Dialog Modal */}
      <Dialog 
        open={catalogPickerTargetIndex !== null} 
        onOpenChange={(open) => !open && setCatalogPickerTargetIndex(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl">
          <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>เลือกวัสดุจาก Master Catalog เพื่อนำเข้าสเปก BOM</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ค้นหาจากชื่อรายการ รหัส SKU หรือรายละเอียดวัสดุในคลัง
            </DialogDescription>

            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchCatalogQuery}
                onChange={(e) => setSearchCatalogQuery(e.target.value)}
                placeholder="ค้นหาชื่อวัสดุ หรือ รหัส SKU..."
                className="pl-9 h-9 text-xs rounded-xl bg-background"
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 divide-y divide-border/40">
            {loadingMaster ? (
              <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
                กำลังโหลดรายการวัสดุจากฐานข้อมูล...
              </div>
            ) : filteredCatalogItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                ไม่พบรายการวัสดุที่ตรงกับคำค้นหา
              </div>
            ) : (
              filteredCatalogItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectMasterItem(item)}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded-xl cursor-pointer group"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-xs text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                      <span>• หน่วย: {item.unit || 'ชิ้น'}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3 text-right">
                    <div className="text-xs">
                      <div className="font-bold text-foreground">
                        {item.total_stock?.toLocaleString() || 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">คงเหลือในคลัง</div>
                    </div>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-muted group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteKitAvailabilityCards;
