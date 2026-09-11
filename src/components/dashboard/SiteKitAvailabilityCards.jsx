import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Router, Antenna, 
  AlertTriangle, CheckCircle2, Layers, 
  ChevronRight, AlertCircle, PenLine, Plus, 
  Trash2, RotateCcw, Save, Search, 
  Package, ShieldCheck, Check, Info, GripVertical
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogDescription 
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { 
  saveCategoryBom, 
  resetCategoryBomToDefault, 
  fetchMasterCatalogItems 
} from '@/lib/siteKits';
import SiteKitCategoryCard, { resolveCategoryVisuals } from './SiteKitCategoryCard';

const COMMON_UNITS = ['ชิ้น', 'ชุด', 'เมตร', 'ลูก', 'ต้น', 'เครื่อง', 'กล่อง', 'ม้วน', 'แพ็ค'];

const SiteKitAvailabilityCards = ({ siteKits = [], loading = false, onRefresh }) => {
  const { t } = useTranslation();
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

  // Drag and drop state for reordering items
  const [draggedItem, setDraggedItem] = useState(null); // { index: number, section: 'complete' | 'spare' }
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Helpers for mutual exclusivity between Complete Set and Spare Equipment
  const isSpareItem = (item) => item.is_mandatory === false || item.notes === 'spare';
  const isCompleteSetItem = (item) => !isSpareItem(item);

  // Reorder handlers
  const handleDragStart = (e, displayIdx, section) => {
    setDraggedItem({ index: displayIdx, section });
    setDragOverIndex(displayIdx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${section}:${displayIdx}`);
  };

  const handleDragOver = (e, displayIdx, section) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.section !== section) return;
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== displayIdx) {
      setDragOverIndex(displayIdx);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetDisplayIdx, targetSection) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.section !== targetSection) {
      setDraggedItem(null);
      setDragOverIndex(null);
      return;
    }

    const sourceDisplayIdx = draggedItem.index;
    setDraggedItem(null);
    setDragOverIndex(null);

    if (sourceDisplayIdx === targetDisplayIdx) return;

    setBomDraft(prev => {
      const isComplete = targetSection === 'complete';
      const completeItems = prev.filter(isCompleteSetItem);
      const spareItems = prev.filter(isSpareItem);

      if (isComplete) {
        if (
          sourceDisplayIdx < 0 || sourceDisplayIdx >= completeItems.length ||
          targetDisplayIdx < 0 || targetDisplayIdx >= completeItems.length
        ) {
          return prev;
        }
        const updatedComplete = [...completeItems];
        const [moved] = updatedComplete.splice(sourceDisplayIdx, 1);
        updatedComplete.splice(targetDisplayIdx, 0, moved);

        return [...updatedComplete, ...spareItems].map((it, idx) => ({
          ...it,
          po_seq: idx + 1
        }));
      } else {
        if (
          sourceDisplayIdx < 0 || sourceDisplayIdx >= spareItems.length ||
          targetDisplayIdx < 0 || targetDisplayIdx >= spareItems.length
        ) {
          return prev;
        }
        const updatedSpare = [...spareItems];
        const [moved] = updatedSpare.splice(sourceDisplayIdx, 1);
        updatedSpare.splice(targetDisplayIdx, 0, moved);

        return [...completeItems, ...updatedSpare].map((it, idx) => ({
          ...it,
          po_seq: idx + 1
        }));
      }
    });
  };

  // Initialize editable BOM draft when selected category changes or BOM modal opens
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
  }, [selectedCategory]);

  const selectedCategoryId = selectedCategory?.category_id;

  // Sync selectedCategory with fresh siteKits from parent onRefresh
  useEffect(() => {
    if (selectedCategoryId && !isEditing) {
      const updatedCat = siteKits.find(c => c.category_id === selectedCategoryId);
      if (updatedCat) {
        setSelectedCategory(prev => prev ? { ...prev, ...updatedCat } : null);
      }
    }
  }, [siteKits, isEditing, selectedCategoryId]);

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

  // Memoized & deduplicated items for read-only Dialog views (TASK 1 & TASK 3)
  const completeSetItems = useMemo(() => {
    const raw = (selectedCategory?.items || []).filter(isCompleteSetItem);
    const seen = new Set();
    return raw.filter((item, idx) => {
      const key = item.id || `${item.item_id || 'noitem'}-${item.po_seq ?? idx}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedCategory?.items]);

  const spareItems = useMemo(() => {
    const raw = (selectedCategory?.items || []).filter(isSpareItem);
    const seen = new Set();
    return raw.filter((item, idx) => {
      const key = item.id || `${item.item_id || 'noitem'}-${item.po_seq ?? idx}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedCategory?.items]);

  const handleAddRow = (isSpareContext = false) => {
    setBomDraft(prev => {
      const newItem = {
        po_seq: prev.length + 1,
        part_number: '',
        item_name: '',
        item_id: null,
        qty_per_site: 1,
        unit: 'ชิ้น',
        is_mandatory: !isSpareContext,
        notes: isSpareContext ? 'spare' : ''
      };
      const completeItems = prev.filter(isCompleteSetItem);
      const spareItems = prev.filter(isSpareItem);
      if (!isSpareContext) {
        return [...completeItems, newItem, ...spareItems].map((it, idx) => ({ ...it, po_seq: idx + 1 }));
      } else {
        return [...completeItems, ...spareItems, newItem].map((it, idx) => ({ ...it, po_seq: idx + 1 }));
      }
    });
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
          ? `Moved "${current.item_name || 'Item'}" to Spare Equipment`
          : `Moved "${current.item_name || 'Item'}" to Complete Set`
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
        ? `Selected "${item.name}" as Spare Equipment (auto-removed from Complete Set)`
        : `Selected "${item.name}" as Complete Set (auto-removed from Spare Equipment)`
    );
  };

  const handleSaveBom = async () => {
    if (!selectedCategory) return;
    if (!canEditBom) {
      toast.error('Only administrators (Admin) can edit BOM specifications');
      return;
    }

    // Validation
    const invalidItems = bomDraft.filter(i => !i.item_name || !i.item_name.trim());
    if (invalidItems.length > 0) {
      toast.error('Please specify equipment name for all rows or remove empty rows');
      return;
    }

    const invalidQty = bomDraft.filter(i => i.qty_per_site === undefined || i.qty_per_site === null || Number(i.qty_per_site) < 0);
    if (invalidQty.length > 0) {
      toast.error('Quantity per site cannot be negative (>= 0)');
      return;
    }

    // Enforce mutual exclusion & deduplication before saving, strictly preserving user-defined order
    const cleanBomDraft = [];
    const seen = new Set();
    for (let i = 0; i < bomDraft.length; i++) {
      const item = bomDraft[i];
      const key = item.item_id || `${(item.item_name || '').trim().toLowerCase()}_${(item.part_number || '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleanBomDraft.push({
          ...item,
          po_seq: cleanBomDraft.length + 1
        });
      }
    }

    try {
      setSaving(true);
      await saveCategoryBom(selectedCategory.category_id, cleanBomDraft);
      toast.success(t('siteKits.saveSuccess', { name: selectedCategory.category_name }));
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
      toast.error(error.message || t('siteKits.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!selectedCategory) return;
    if (!window.confirm(t('siteKits.resetConfirm', { name: selectedCategory.category_name }))) {
      return;
    }

    try {
      setResetting(true);
      await resetCategoryBomToDefault(selectedCategory.category_id);
      toast.success(t('siteKits.resetSuccess', { name: selectedCategory.category_name }));
      setIsEditing(false);

      if (onRefresh) {
        await onRefresh();
      }
      setSelectedCategory(null);
    } catch (error) {
      console.error('Error resetting BOM to default:', error);
      toast.error(error.message || t('siteKits.resetFailed'));
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
            <div key={i} className="h-48 rounded-xl bg-muted/50 border border-border/60 animate-pulse" />
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
              Site Installation Kits BOM Availability
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
            Calculates completely assembled kits according to the BOM specification of each site, and alerts when components have limited stock {canEditBom ? '(Admin can click to edit BOM specifications)' : ''}
          </p>
        </div>
      </div>

      {/* Responsive BOM Category Cards Grid (Data-driven) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {siteKits.map((cat) => (
          <SiteKitCategoryCard
            key={cat.category_id}
            category={cat}
            canEditBom={canEditBom}
            onSelect={setSelectedCategory}
          />
        ))}
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
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-xl p-0 overflow-hidden border-border bg-card shadow-lg">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  {selectedCategory && (() => {
                    const { Icon } = resolveCategoryVisuals(selectedCategory);
                    return <Icon className="w-5 h-5" />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {selectedCategory?.category_name}
                    </DialogTitle>
                    {isEditing ? (
                      <Badge className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                        {bomView === 'spare' ? t('siteKits.editSpareAdmin') : t('siteKits.editBomAdmin')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                        {t('siteKits.completeSetsAssembled', { count: selectedCategory?.complete_sets || 0 })}
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {isEditing 
                      ? (bomView === 'spare' 
                          ? t('siteKits.editSpareDesc')
                          : t('siteKits.editBomDesc'))
                      : (bomView === 'spare'
                          ? t('siteKits.viewSpareDesc')
                          : t('siteKits.viewBomDesc'))}
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
                    className="rounded-lg h-9 px-3 gap-1.5 text-xs font-medium border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 cursor-pointer shadow-xs"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>{bomView === 'spare' ? t('siteKits.editSpareBtn') : t('siteKits.editBomBtn')}</span>
                  </Button>
                )}

                {isEditing && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resetting || saving}
                      onClick={handleResetDefault}
                      className="rounded-lg h-9 px-3 gap-1.5 text-xs font-medium text-muted-foreground hover:text-rose-600 border-border hover:bg-rose-500/10 cursor-pointer shadow-xs"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                      <span>{t('siteKits.resetDefault')}</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setIsEditing(false)}
                      className="rounded-lg h-9 px-3 text-xs font-medium text-muted-foreground hover:bg-muted cursor-pointer"
                    >
                      <span>{t('common.cancel')}</span>
                    </Button>

                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={handleSaveBom}
                      className="rounded-lg h-9 px-4 gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
                    >
                      <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                      <span>{saving ? t('common.loading') : t('common.save')}</span>
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
                {t('siteKits.completeSetTab')}
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
                {t('siteKits.spareEquipmentTab')}
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
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 px-4 text-xs text-blue-800 dark:text-blue-300">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    {t('siteKits.completeSetNotice')}
                  </span>
                </div>

                <div className="rounded-lg border border-border overflow-hidden shadow-xs bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                      <tr>
                        <th className="py-2.5 px-2 w-16 text-center">{t('siteKits.thSeq')}</th>
                        <th className="py-2.5 px-3 min-w-[200px]">{t('siteKits.thItemPart')}</th>
                        <th className="py-2.5 px-3 text-center w-28">{t('siteKits.thQtySite')}</th>
                        <th className="py-2.5 px-3 text-center w-28">{t('siteKits.thUnit')}</th>
                        <th className="py-2.5 px-3 text-center w-32">{t('siteKits.thKitCategory')}</th>
                        <th className="py-2.5 px-3 text-center w-14">{t('siteKits.thAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {bomDraft
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(({ item }) => isCompleteSetItem(item))
                        .map(({ item, originalIndex }, displayIdx) => {
                          const isDraggingThis = draggedItem?.section === 'complete' && draggedItem?.index === displayIdx;
                          const isDragOverThis = draggedItem?.section === 'complete' && dragOverIndex === displayIdx && draggedItem?.index !== displayIdx;

                          return (
                            <tr
                              key={item.id ? `edit-comp-${item.id}` : `${item.item_id || 'item'}-${item.part_number || 'part'}-${originalIndex}`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, displayIdx, 'complete')}
                              onDragOver={(e) => handleDragOver(e, displayIdx, 'complete')}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handleDrop(e, displayIdx, 'complete')}
                              className={`transition-all duration-150 ${
                                isDraggingThis
                                  ? 'opacity-40 bg-muted/60 scale-[0.99]'
                                  : isDragOverThis
                                    ? 'bg-blue-500/10 border-t-2 border-blue-500 shadow-xs'
                                    : 'hover:bg-muted/30'
                              }`}
                            >
                              {/* Sequence & Drag Handle */}
                              <td className="py-2 px-2 text-center font-bold text-muted-foreground select-none">
                                <div className="flex items-center justify-center gap-1">
                                  <span
                                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center justify-center"
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </span>
                                  <span className="w-4 text-center">{displayIdx + 1}</span>
                                </div>
                              </td>

                              {/* Item Name & Part Selector */}
                              <td className="py-2 px-3 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={item.item_name}
                                    onChange={(e) => handleFieldChange(originalIndex, 'item_name', e.target.value)}
                                    placeholder="Enter item name or select from catalog..."
                                    className="h-8 text-xs font-semibold rounded-lg bg-background"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCatalogPickerTargetIndex(originalIndex);
                                      setSearchCatalogQuery(item.item_name || '');
                                    }}
                                    title="Select from Master Catalog"
                                    className="h-8 px-2.5 gap-1 text-[11px] font-bold rounded-lg border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 shrink-0 cursor-pointer"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
                                  >
                                    <Package className="w-3.5 h-3.5" />
                                    <span>From Catalog</span>
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Part Number / SKU:</span>
                                  <Input
                                    value={item.part_number}
                                    onChange={(e) => handleFieldChange(originalIndex, 'part_number', e.target.value)}
                                    placeholder="e.g. 30207-0024-XXXXX"
                                    className="h-6 text-[11px] font-mono rounded-md bg-muted/30"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
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
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
                                />
                              </td>

                              {/* Unit */}
                              <td className="py-2 px-3 text-center">
                                <Input
                                  value={item.unit}
                                  onChange={(e) => handleFieldChange(originalIndex, 'unit', e.target.value)}
                                  placeholder="unit"
                                  list={`unit-list-${originalIndex}`}
                                  className="h-8 text-xs text-center font-medium rounded-lg w-20 mx-auto bg-background"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
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
                                  title="Click to move to Spare Equipment (removes from Complete Set)"
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-sky-500/20 hover:text-sky-700"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
                                >
                                  Complete Set
                                </button>
                              </td>

                              {/* Delete */}
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(originalIndex)}
                                  title="Remove item"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {bomDraft.filter(isCompleteSetItem).length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No items in Complete Set yet
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
                    <span>Add Item to Complete Set</span>
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Complete Set has {bomDraft.filter(isCompleteSetItem).length} {bomDraft.filter(isCompleteSetItem).length === 1 ? 'item' : 'items'} in total
                  </span>
                </div>
              </div>
            ) : isEditing && bomView === 'spare' ? (
              /* =======================================================
               * ADMIN EDITABLE SPARE EQUIPMENT FORM VIEW
               * ======================================================= */
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 px-4 text-xs text-blue-800 dark:text-blue-300">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    {t('siteKits.spareNotice')}
                  </span>
                </div>

                <div className="rounded-lg border border-border overflow-hidden shadow-xs bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                      <tr>
                        <th className="py-2.5 px-2 w-16 text-center">{t('siteKits.thSeq')}</th>
                        <th className="py-2.5 px-3 min-w-[200px]">{t('siteKits.thItemPart')}</th>
                        <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thQtySite')}</th>
                        <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thUnit')}</th>
                        <th className="py-2.5 px-3 text-center w-32">{t('siteKits.thKitCategory')}</th>
                        <th className="py-2.5 px-3 text-center w-28">{t('siteKits.thAvailableStock')}</th>
                        <th className="py-2.5 px-3 text-center w-12">{t('siteKits.thAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {bomDraft
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(({ item }) => isSpareItem(item))
                        .map(({ item, originalIndex }, displayIdx) => {
                          const { stock, spareStock } = getRowSpareMetrics(item);
                          const isDraggingThis = draggedItem?.section === 'spare' && draggedItem?.index === displayIdx;
                          const isDragOverThis = draggedItem?.section === 'spare' && dragOverIndex === displayIdx && draggedItem?.index !== displayIdx;

                          return (
                            <tr
                              key={item.id ? `edit-spare-${item.id}` : `${item.item_id || 'item'}-${item.part_number || 'part'}-${originalIndex}`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, displayIdx, 'spare')}
                              onDragOver={(e) => handleDragOver(e, displayIdx, 'spare')}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handleDrop(e, displayIdx, 'spare')}
                              className={`transition-all duration-150 ${
                                isDraggingThis
                                  ? 'opacity-40 bg-muted/60 scale-[0.99]'
                                  : isDragOverThis
                                    ? 'bg-blue-500/10 border-t-2 border-blue-500 shadow-xs'
                                    : 'hover:bg-muted/30'
                              }`}
                            >
                              {/* Sequence & Drag Handle */}
                              <td className="py-2 px-2 text-center font-bold text-muted-foreground select-none">
                                <div className="flex items-center justify-center gap-1">
                                  <span
                                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center justify-center"
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </span>
                                  <span className="w-4 text-center">{displayIdx + 1}</span>
                                </div>
                              </td>

                              {/* Item Name & Part Selector */}
                              <td className="py-2 px-3 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={item.item_name}
                                    onChange={(e) => handleFieldChange(originalIndex, 'item_name', e.target.value)}
                                    placeholder="Enter item name or select from catalog..."
                                    className="h-8 text-xs font-semibold rounded-lg bg-background"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCatalogPickerTargetIndex(originalIndex);
                                      setSearchCatalogQuery(item.item_name || '');
                                    }}
                                    title="Select from Master Catalog"
                                    className="h-8 px-2.5 gap-1 text-[11px] font-bold rounded-lg border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 shrink-0 cursor-pointer"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
                                  >
                                    <Package className="w-3.5 h-3.5" />
                                    <span>From Catalog</span>
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Part Number / SKU:</span>
                                  <Input
                                    value={item.part_number}
                                    onChange={(e) => handleFieldChange(originalIndex, 'part_number', e.target.value)}
                                    placeholder="e.g. 30207-0024-XXXXX"
                                    className="h-6 text-[11px] font-mono rounded-md bg-muted/30"
                                    draggable={false}
                                    onDragStart={(e) => e.stopPropagation()}
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
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
                                />
                              </td>

                              {/* Unit */}
                              <td className="py-2 px-3 text-center">
                                <Input
                                  value={item.unit}
                                  onChange={(e) => handleFieldChange(originalIndex, 'unit', e.target.value)}
                                  placeholder="unit"
                                  list={`unit-list-spare-${originalIndex}`}
                                  className="h-8 text-xs text-center font-medium rounded-lg w-20 mx-auto bg-background"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
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
                                  title="Click to move to Complete Set"
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40 hover:bg-emerald-500/20 hover:text-emerald-700"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
                                >
                                  Spare Equipment
                                </button>
                              </td>

                              {/* Live Stock & Spare Preview */}
                              <td className="py-2 px-3 text-center">
                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-semibold text-foreground">
                                    Stock: {stock.toLocaleString()}
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
                                  title="Remove item"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  draggable={false}
                                  onDragStart={(e) => e.stopPropagation()}
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
                      No items in Spare Equipment yet
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
                    <span>Add Spare Equipment Item</span>
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Spare Equipment has {bomDraft.filter(isSpareItem).length} {bomDraft.filter(isSpareItem).length === 1 ? 'item' : 'items'} in total
                  </span>
                </div>
              </div>
            ) : bomView === 'complete' ? (
              /* =======================================================
               * READ-ONLY COMPLETE SET BOM BREAKDOWN VIEW
               * ======================================================= */
              <div className="rounded-lg border border-border overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">{t('siteKits.thSeq')}</th>
                      <th className="py-2.5 px-3">{t('siteKits.thItemPart')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thQtySite')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thAvailableStock')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thSetsPossible')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {completeSetItems.map((item, idx) => {
                      const isLimiting = item.is_mandatory && item.sets_possible === selectedCategory.complete_sets;
                      return (
                        <tr 
                          key={item.id ? `ro-comp-${item.id}` : `${item.item_id || item.part_number || 'comp'}-${item.po_seq ?? idx}-${idx}`} 
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
                              {item.sets_possible} {item.sets_possible === 1 ? 'set' : 'sets'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.total_stock === 0 ? (
                              <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px]">
                                Out of Stock
                              </Badge>
                            ) : isLimiting ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                                Limited Stock
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                                Ready
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {completeSetItems.length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No items in Complete Set
                  </div>
                )}
              </div>
            ) : (
              /* =======================================================
               * READ-ONLY SPARE EQUIPMENT VIEW
               * ======================================================= */
              <div className="rounded-lg border border-border overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">{t('siteKits.thSeq')}</th>
                      <th className="py-2.5 px-3">{t('siteKits.thItemPart')}</th>
                      <th className="py-2.5 px-3 text-center w-28">{t('siteKits.thQtySite')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.thAvailableStock')}</th>
                      <th className="py-2.5 px-3 text-center w-32">{t('siteKits.completeSetTab')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('siteKits.spareEquipmentTab')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {spareItems.map((item, idx) => {
                      const stock = Number(item.total_stock) || 0;
                      const allocatedStock = 0;
                      const spareStock = stock;

                      return (
                        <tr key={item.id ? `ro-spr-${item.id}` : `${item.item_id || item.part_number || 'spr'}-${item.po_seq ?? idx}-${idx}`} className="hover:bg-muted/30 transition-colors">
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
                    No items in Spare Equipment for this category
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
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col rounded-xl p-0 overflow-hidden border-border bg-card shadow-lg">
          <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Select Material from Master Catalog for BOM</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Search by item name, SKU, or warehouse specifications
            </DialogDescription>

            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchCatalogQuery}
                onChange={(e) => setSearchCatalogQuery(e.target.value)}
                placeholder="Search item name or SKU..."
                className="pl-9 h-9 text-xs rounded-lg bg-background"
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 divide-y divide-border/40">
            {loadingMaster ? (
              <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
                Loading items from database...
              </div>
            ) : filteredCatalogItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No matching items found
              </div>
            ) : (
              filteredCatalogItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectMasterItem(item)}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded-lg cursor-pointer group"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-xs text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                      <span>• Unit: {item.unit || 'ชิ้น'}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3 text-right">
                    <div className="text-xs">
                      <div className="font-bold text-foreground">
                        {item.total_stock?.toLocaleString() || 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">In Stock</div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted group-hover:bg-emerald-500 group-hover:text-white transition-colors">
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

export default React.memo(SiteKitAvailabilityCards);
