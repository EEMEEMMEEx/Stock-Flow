import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wrench, PackageCheck, Recycle, Trash2, AlertTriangle, Layers, Boxes, Loader2, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n';
import { cleanRpcMessage, isSchemaMismatchError } from '@/lib/rpcErrors';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';

/**
 * บันทึกผลการซ่อมของรายการรับคืนสภาพ 'damaged' / 'needs_repair'
 * (docs/partial-damage-component-repair-plan.md §5)
 *
 * 3 แนวทาง:
 *   1. restored_to_stock : ซ่อมเสร็จแล้วคืนอุปกรณ์เข้าคลัง (+N) ตัดสต็อกอะไหล่ย่อยได้ (ถ้ามี)
 *   2. parts_harvested   : แยกอะไหล่ ลงทะเบียนของเสีย และรับเข้าชิ้นส่วนที่ยังดีได้ (ถ้าต้องการ)
 *   3. scrapped          : แทงจำหน่าย/ของเสีย ไม่คืนสต็อก
 *
 * ทุกเส้นทางเรียก RPC public.resolve_damaged_return_item(p_payload) ซึ่งเป็น Atomic +
 * Idempotent (ล็อกแถว return log และปฏิเสธการกดซ้ำ)
 */

const RESOLUTION_OPTIONS = [
  { value: 'restored_to_stock', labelKey: 'checkouts.repairModeRestore', descKey: 'checkouts.repairModeRestoreDesc', Icon: PackageCheck },
  { value: 'parts_harvested', labelKey: 'checkouts.repairModeHarvest', descKey: 'checkouts.repairModeHarvestDesc', Icon: Recycle },
  { value: 'scrapped', labelKey: 'checkouts.repairModeScrap', descKey: 'checkouts.repairModeScrapDesc', Icon: Trash2 },
];

const DISPOSAL_OPTIONS = [
  { value: 'parts_harvest', labelKey: 'checkouts.repairDisposalHarvest' },
  { value: 'electronic_waste', labelKey: 'checkouts.repairDisposalElectronic' },
  { value: 'recycle', labelKey: 'checkouts.repairDisposalRecycle' },
  { value: 'dispose', labelKey: 'checkouts.repairDisposalDispose' },
];

const RepairResolutionModal = ({
  isOpen = false,
  onClose,
  returnLog = null,
  order = null,
  onResolved
}) => {
  const { t } = useTranslation();

  const [resolution, setResolution] = useState('restored_to_stock');
  const [projectId, setProjectId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [repairNotes, setRepairNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [disposalMethod, setDisposalMethod] = useState('parts_harvest');

  const [spareEnabled, setSpareEnabled] = useState(false);
  const [spareItemId, setSpareItemId] = useState('');
  const [spareQty, setSpareQty] = useState('1');

  const [harvestEnabled, setHarvestEnabled] = useState(false);
  const [harvestItemId, setHarvestItemId] = useState('');
  const [harvestQty, setHarvestQty] = useState('1');

  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [spareOptions, setSpareOptions] = useState([]);
  const [loadingSpare, setLoadingSpare] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const returnedQuantity = Number(returnLog?.returned_quantity || 1);

  // Reset form ทุกครั้งที่เปิดโมดอลให้ตรงกับรายการที่เลือก
  useEffect(() => {
    if (!isOpen || !returnLog) return;
    setResolution('restored_to_stock');
    setProjectId(returnLog.destination_project_id || order?.project_id || 'all');
    setQuantity(String(returnedQuantity));
    setRepairNotes('');
    setReferenceNumber('');
    setSerialNumber(returnLog.checkout_items?.serial_number || returnLog.replaced_serial_number || '');
    setDisposalMethod('parts_harvest');
    setSpareEnabled(false);
    setSpareItemId('');
    setSpareQty('1');
    setHarvestEnabled(false);
    setHarvestItemId('');
    setHarvestQty('1');
  }, [isOpen, returnLog, order?.project_id, returnedQuantity]);

  // โหลดข้อมูลอ้างอิง (โครงการ/คลัง + รายการวัสดุสำหรับเลือกชิ้นส่วนที่รับเข้า)
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [projectRes, itemRes] = await Promise.all([
          supabase.from('projects').select('id, name, project_code, location, description, status').eq('status', 'active').order('name'),
          supabase.from('items').select('id, name, unit').order('name'),
        ]);
        if (cancelled) return;
        if (projectRes.error) throw projectRes.error;
        if (itemRes.error) throw itemRes.error;
        setProjects(projectRes.data || []);
        setItems(itemRes.data || []);
      } catch (err) {
        if (!cancelled) {
          console.warn('[RepairResolutionModal] reference data load failed:', err?.message || err);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  // ตัวเลือกอะไหล่ย่อย = รายการที่มีสต็อกคงเหลือจริงในคลังที่เลือก
  useEffect(() => {
    if (!isOpen || resolution !== 'restored_to_stock' || !spareEnabled || !projectId) {
      setSpareOptions([]);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingSpare(true);
        const targetProjectId = (projectId && projectId !== 'all')
          ? projectId
          : (returnLog?.destination_project_id || order?.project_id || projects[0]?.id);

        if (!targetProjectId) {
          setSpareOptions([]);
          return;
        }

        const { data, error } = await supabase
          .from('stock_balance')
          .select('item_id, item_name, unit, balance')
          .eq('project_id', targetProjectId)
          .gt('balance', 0)
          .order('item_name');

        if (cancelled) return;
        if (error) throw error;
        setSpareOptions(data || []);
      } catch (err) {
        if (!cancelled) {
          console.warn('[RepairResolutionModal] spare part options load failed:', err?.message || err);
          setSpareOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingSpare(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, resolution, spareEnabled, projectId, returnLog?.destination_project_id, order?.project_id, projects]);

  if (!returnLog) return null;

  const selectedSpare = spareOptions.find((option) => option.item_id === spareItemId) || null;
  const selectedHarvestItem = items.find((item) => item.id === harvestItemId) || null;
  const isRestore = resolution === 'restored_to_stock';
  const isHarvest = resolution === 'parts_harvested';

  const validate = () => {
    if (!projectId) return 'checkouts.repairProjectRequired';
    if (!repairNotes.trim()) return 'checkouts.repairNotesRequired';

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return 'checkouts.repairQtyInvalid';
    if (qty > returnedQuantity) return 'checkouts.repairQtyExceeds';

    if (isRestore && spareEnabled) {
      if (!spareItemId) return 'checkouts.repairSpareRequired';
      const spareQtyNumber = Number(spareQty);
      if (!Number.isInteger(spareQtyNumber) || spareQtyNumber <= 0) return 'checkouts.repairSpareQtyInvalid';
      if (selectedSpare && spareQtyNumber > Number(selectedSpare.balance || 0)) return 'checkouts.repairSpareInsufficient';
    }

    if (isHarvest && harvestEnabled) {
      if (!harvestItemId) return 'checkouts.repairHarvestRequired';
      const harvestQtyNumber = Number(harvestQty);
      if (!Number.isInteger(harvestQtyNumber) || harvestQtyNumber <= 0) return 'checkouts.repairHarvestQtyInvalid';
    }

    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const validationKey = validate();
    if (validationKey) {
      toast.error(t(validationKey));
      return;
    }

    const resolvedProjectId = (projectId && projectId !== 'all')
      ? projectId
      : (returnLog?.destination_project_id || order?.project_id || projects[0]?.id || null);

    if (!resolvedProjectId) {
      toast.error(t('checkouts.repairProjectRequired'));
      return;
    }

    const payload = {
      return_log_id: returnLog.id,
      resolution,
      project_id: resolvedProjectId,
      quantity: Number(quantity),
      repair_notes: repairNotes.trim(),
      reference_number: referenceNumber.trim() || null,
      serial_number: serialNumber.trim() || null,
      disposal_method: isRestore ? null : disposalMethod,
      spare_part_item_id: isRestore && spareEnabled ? spareItemId : null,
      spare_part_quantity: isRestore && spareEnabled ? Number(spareQty) : null,
      harvested_item_id: isHarvest && harvestEnabled ? harvestItemId : null,
      harvested_quantity: isHarvest && harvestEnabled ? Number(harvestQty) : null,
    };

    try {
      setSubmitting(true);
      const { data, error } = await supabase.rpc('resolve_damaged_return_item', { p_payload: payload });
      if (error) throw error;

      if (data?.message) toast.success(data.message);
      else if (isRestore) toast.success(t('checkouts.repairSuccessRestore', { qty: Number(quantity) }));
      else if (isHarvest) toast.success(t('checkouts.repairSuccessHarvest'));
      else toast.success(t('checkouts.repairSuccessScrap'));

      onResolved?.(data);
      onClose?.();
    } catch (err) {
      console.error('[RepairResolutionModal] resolve failed:', err);
      if (isSchemaMismatchError(err)) toast.error(t('checkouts.repairMigrationMissing'));
      else toast.error(cleanRpcMessage(err) || t('checkouts.repairFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const itemName = returnLog.checkout_items?.items?.name || order?.checkout_items?.[0]?.items?.name || t('dashboard.item');
  const unit = returnLog.checkout_items?.items?.unit || t('common.piece');
  const serial = returnLog.checkout_items?.serial_number || returnLog.replaced_serial_number || '-';
  const submitTone = isRestore
    ? 'bg-emerald-600 hover:bg-emerald-700'
    : 'bg-amber-600 hover:bg-amber-700';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose?.()}>
      <DialogContent className="sm:max-w-2xl rounded-xl bg-card p-6 border border-border shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {t('checkouts.repairModalTitle')}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {itemName} • S/N: {serial} • {t('checkouts.returnQty')} {returnedQuantity} {unit}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* 1. แนวทางจัดการ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">{t('checkouts.repairModeLabel')}</Label>
              <div className="grid grid-cols-1 gap-2">
                {RESOLUTION_OPTIONS.map(({ value, labelKey, descKey, Icon }) => {
                  const active = resolution === value;
                  const modeClass = active
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40';
                  const iconClass = active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground';
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setResolution(value)}
                      disabled={submitting}
                      aria-pressed={active}
                      className={'w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 flex items-start gap-2.5 ' + modeClass}
                    >
                      <Icon className={'w-4 h-4 mt-0.5 shrink-0 ' + iconClass} />
                      <span>
                        <span className="block text-xs font-bold text-foreground">{t(labelKey)}</span>
                        <span className="block text-[11px] text-muted-foreground">{t(descKey)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. คลังปลายทาง + จำนวน */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
              <div className="space-y-1.5 sm:col-span-2">
                <ProjectLocationSelector
                  id="repair-project"
                  projects={projects}
                  value={projectId}
                  onChange={(val) => {
                    setProjectId(val);
                    setSpareItemId('');
                  }}
                  required={true}
                  allowAll={true}
                  allLabel={t('withdrawals.allLocationsLabel', '-- ทุกโครงการและคลังสินค้า (ยอดรวมทั้งระบบ) --')}
                  label={t('checkouts.repairProjectLabel')}
                  icon={Layers}
                  iconClassName="w-3.5 h-3.5 text-indigo-500"
                  disabled={submitting}
                  showSummaryCard={Boolean(projectId && projectId !== 'all')}
                  showCount={false}
                />
                {projectId === 'all' && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 text-indigo-600 dark:text-indigo-400">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>
                      {t('checkouts.repairAllProjectsHint')}:{' '}
                      <span className="font-semibold text-foreground">
                        {projects.find((p) => p.id === (returnLog?.destination_project_id || order?.project_id || projects[0]?.id))?.name || ''}
                        {projects.find((p) => p.id === (returnLog?.destination_project_id || order?.project_id || projects[0]?.id))?.location
                          ? ` — ${projects.find((p) => p.id === (returnLog?.destination_project_id || order?.project_id || projects[0]?.id))?.location}`
                          : ''}
                      </span>
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="repair-quantity" className="text-xs font-semibold text-foreground">
                  {t('checkouts.repairQuantityLabel')}
                </Label>
                <Input
                  id="repair-quantity"
                  type="number"
                  min="1"
                  max={returnedQuantity}
                  step="1"
                  required
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  disabled={submitting}
                  className="h-9 text-xs rounded-lg"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('checkouts.repairQuantityHint', { max: returnedQuantity, unit })}
                </p>
              </div>
            </div>

            {/* 3. รายละเอียดการซ่อม / เหตุผล */}
            <div className="space-y-1.5">
              <Label htmlFor="repair-notes" className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>{isRestore ? t('checkouts.repairNotesLabel') : t('checkouts.repairReasonLabel')}</span>
                <span className="text-[10px] text-rose-500 font-bold">* {t('common.required')}</span>
              </Label>
              <textarea
                id="repair-notes"
                required
                rows={3}
                value={repairNotes}
                onChange={(event) => setRepairNotes(event.target.value)}
                disabled={submitting}
                placeholder={isRestore ? t('checkouts.repairNotesPlaceholder') : t('checkouts.repairReasonPlaceholder')}
                className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none disabled:opacity-50"
              />
            </div>

            {/* 4. S/N + เลขที่อ้างอิง */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="repair-serial" className="text-xs font-semibold text-foreground">
                  {t('checkouts.repairSerialLabel')}
                </Label>
                <Input
                  id="repair-serial"
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                  disabled={submitting}
                  placeholder={t('checkouts.repairSerialPlaceholder')}
                  className="h-9 text-xs rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repair-reference" className="text-xs font-semibold text-foreground">
                  {t('checkouts.repairReferenceLabel')}
                </Label>
                <Input
                  id="repair-reference"
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  disabled={submitting}
                  placeholder={t('checkouts.repairReferencePlaceholder')}
                  className="h-9 text-xs rounded-lg"
                />
              </div>
            </div>

            {/* 5. ตัดสต็อกอะไหล่ย่อย (เฉพาะกรณีซ่อมเสร็จคืนคลัง) */}
            {isRestore && (
              <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-2.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spareEnabled}
                    onChange={(event) => setSpareEnabled(event.target.checked)}
                    disabled={submitting}
                    className="mt-0.5 w-4 h-4 rounded border-input text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>
                    <span className="block text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-indigo-500" />
                      {t('checkouts.repairSpareToggle')}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{t('checkouts.repairSpareHint')}</span>
                  </span>
                </label>

                {spareEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="repair-spare-item" className="text-[11px] font-semibold text-foreground">
                        {t('checkouts.repairSpareItem')}
                      </Label>
                      <select
                        id="repair-spare-item"
                        value={spareItemId}
                        onChange={(event) => setSpareItemId(event.target.value)}
                        disabled={submitting || loadingSpare}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {loadingSpare
                            ? t('common.loading')
                            : spareOptions.length === 0
                              ? t('checkouts.repairSpareEmpty')
                              : '-- ' + t('common.select') + ' --'}
                        </option>
                        {spareOptions.map((option) => (
                          <option key={option.item_id} value={option.item_id}>
                            {option.item_name} ({t('stockIn.qtySourceRemaining')} {option.balance} {option.unit || t('common.piece')})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="repair-spare-qty" className="text-[11px] font-semibold text-foreground">
                        {t('checkouts.repairSpareQty')}
                      </Label>
                      <Input
                        id="repair-spare-qty"
                        type="number"
                        min="1"
                        step="1"
                        value={spareQty}
                        onChange={(event) => setSpareQty(event.target.value)}
                        disabled={submitting}
                        className="h-9 text-xs rounded-lg"
                      />
                      {selectedSpare && (
                        <p className="text-[10px] text-muted-foreground">
                          {t('stockIn.qtySourceRemaining')} {selectedSpare.balance} {selectedSpare.unit || t('common.piece')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. กรณีแยกอะไหล่: วิธีจำหน่าย + รับเข้าชิ้นส่วนที่ยังดี */}
            {!isRestore && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5">
                <div className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>{t('checkouts.repairNoStockNote')}</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="repair-disposal" className="text-[11px] font-semibold text-foreground">
                    {t('checkouts.repairDisposalMethod')}
                  </Label>
                  <select
                    id="repair-disposal"
                    value={disposalMethod}
                    onChange={(event) => setDisposalMethod(event.target.value)}
                    disabled={submitting}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {DISPOSAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                  </select>
                </div>

                {isHarvest && (
                  <>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={harvestEnabled}
                        onChange={(event) => setHarvestEnabled(event.target.checked)}
                        disabled={submitting}
                        className="mt-0.5 w-4 h-4 rounded border-input text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>
                        <span className="block text-xs font-bold text-foreground">{t('checkouts.repairHarvestToggle')}</span>
                        <span className="block text-[11px] text-muted-foreground">{t('checkouts.repairHarvestHint')}</span>
                      </span>
                    </label>

                    {harvestEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor="repair-harvest-item" className="text-[11px] font-semibold text-foreground">
                            {t('checkouts.repairHarvestItem')}
                          </Label>
                          <select
                            id="repair-harvest-item"
                            value={harvestItemId}
                            onChange={(event) => setHarvestItemId(event.target.value)}
                            disabled={submitting}
                            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <option value="" disabled>-- {t('common.select')} --</option>
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}{item.unit ? ' (' + item.unit + ')' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="repair-harvest-qty" className="text-[11px] font-semibold text-foreground">
                            {t('checkouts.repairHarvestQty')}
                          </Label>
                          <Input
                            id="repair-harvest-qty"
                            type="number"
                            min="1"
                            step="1"
                            value={harvestQty}
                            onChange={(event) => setHarvestQty(event.target.value)}
                            disabled={submitting}
                            className="h-9 text-xs rounded-lg"
                          />
                          {selectedHarvestItem && (
                            <p className="text-[10px] text-muted-foreground">{selectedHarvestItem.name}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="text-xs rounded-lg h-9"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className={'text-xs rounded-lg h-9 gap-1.5 font-semibold text-white cursor-pointer ' + submitTone}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              <span>
                {submitting
                  ? t('checkouts.repairSubmitting')
                  : isRestore
                    ? t('checkouts.repairSubmitRestore', { qty: Number(quantity) || 0 })
                    : isHarvest
                      ? t('checkouts.repairSubmitHarvest')
                      : t('checkouts.repairSubmitScrap')}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RepairResolutionModal;
