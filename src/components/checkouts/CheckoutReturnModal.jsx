import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RotateCcw,
  CheckCircle2,
  Tag,
  Search,
  CheckSquare,
  Check,
  Plus,
  Camera,
  Loader2,
  AlertCircle,
  Trash2,
  Eye,
  RefreshCw,
  Clock,
  Barcode,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import SignatureRequiredModal from '@/components/common/SignatureRequiredModal';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  compressAndUploadReturnPhoto,
  validateReturnItemsPhotos,
  formatFileSize,
} from '@/lib/imageCompression';

const CheckoutReturnModal = ({
  isOpen,
  onClose,
  order,
  projects = [],
  onReturnSuccess,
}) => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [returnItems, setReturnItems] = useState([]);
  const [showSigModal, setShowSigModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewPhotoItem, setPreviewPhotoItem] = useState(null);

  useEffect(() => {
    if (order && order.checkout_items) {
      const orderLogs = Array.isArray(order.checkout_return_logs) ? order.checkout_return_logs : [];
      const initialItems = order.checkout_items.map((item) => {
        const accounted =
          Number(item.quantity_returned || 0) +
          Number(item.quantity_damaged || 0) +
          Number(item.quantity_lost || 0) +
          Number(item.quantity_consumed || 0);
        const pendingReviewQty = orderLogs
          .filter(
            (l) =>
              l.checkout_item_id === item.id &&
              l.verification_status === 'pending_review' &&
              !l.is_reverted
          )
          .reduce((sum, l) => sum + Number(l.returned_quantity || 0), 0);

        const remaining = Math.max(0, Number(item.quantity_borrowed || 0) - accounted - pendingReviewQty);
        return {
          checkout_item_id: item.id,
          item_name: item.items?.name || item.item_name || 'Item',
          sku: item.items?.sku || '',
          unit: item.items?.unit || 'ชิ้น',
          serial_number: item.serial_number || '',
          returned_serial_number: item.serial_number || '',
          quantity_borrowed: item.quantity_borrowed,
          quantity_already_returned: item.quantity_returned,
          pending_review_quantity: pendingReviewQty,
          remaining_to_return: remaining,
          returned_quantity: remaining > 0 ? remaining : 0, // default return all remaining
          condition: 'normal', // 'normal' | 'damaged' | 'lost' | 'needs_repair' | 'consumed'
          destination_project_id: order.project_id || '',
          damage_notes: '',
          replaced_serial_number: '',
          evidence_photo_url: '',
          photoUploading: false,
          photoError: '',
          photoRawFile: null,
          photoMeta: null,
        };
      });
      setReturnItems(initialItems);
      setSearchTerm('');
      setPreviewPhotoItem(null);
    }
  }, [order, isOpen]);

  if (!order) return null;

  const handleUpdateItem = (itemId, field, value) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.checkout_item_id !== itemId) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const resolvePhotoErrorMessage = (err) => {
    const code = err?.code || '';
    const reason = err?.message || '';
    if (code === 'INVALID_FILE_TYPE') {
      return t('checkouts.toasts.returnPhotoInvalidType');
    }
    if (code === 'FILE_TOO_LARGE') {
      return t('checkouts.toasts.returnPhotoTooLarge');
    }
    if (code === 'COMPRESSION_FAILED') {
      return t('checkouts.toasts.returnPhotoCompressionFailed', { reason });
    }
    if (code === 'UPLOAD_FAILED') {
      return t('checkouts.toasts.returnPhotoUploadFailed', { reason });
    }
    return reason || t('checkouts.toasts.returnPhotoUploadFailed', { reason: 'Error' });
  };

  const handlePhotoUpload = async (itemId, file) => {
    if (!file) return;

    setReturnItems((prev) =>
      prev.map((item) =>
        item.checkout_item_id === itemId
          ? {
              ...item,
              photoUploading: true,
              photoError: '',
              photoRawFile: file,
            }
          : item
      )
    );

    try {
      const result = await compressAndUploadReturnPhoto(file, {
        orderNumber: order.order_number || order.id,
        checkoutItemId: itemId,
      });

      setReturnItems((prev) =>
        prev.map((item) =>
          item.checkout_item_id === itemId
            ? {
                ...item,
                evidence_photo_url: result.publicUrl,
                photoUploading: false,
                photoError: '',
                photoMeta: {
                  originalSize: result.originalSize,
                  compressedSize: result.compressedSize,
                  width: result.width,
                  height: result.height,
                },
              }
            : item
        )
      );

      toast.success(t('checkouts.toasts.returnPhotoUploaded'));
    } catch (err) {
      console.error('[CheckoutReturnModal] Photo compression/upload error:', err);
      const errMsg = resolvePhotoErrorMessage(err);
      setReturnItems((prev) =>
        prev.map((item) =>
          item.checkout_item_id === itemId
            ? {
                ...item,
                evidence_photo_url: '',
                photoUploading: false,
                photoError: errMsg,
                photoMeta: null,
              }
            : item
        )
      );
      toast.error(errMsg);
    }
  };

  const handleRemovePhoto = (itemId) => {
    setReturnItems((prev) =>
      prev.map((item) =>
        item.checkout_item_id === itemId
          ? {
              ...item,
              evidence_photo_url: '',
              photoUploading: false,
              photoError: '',
              photoRawFile: null,
              photoMeta: null,
            }
          : item
      )
    );
  };

  // Quick action: Select / Return all remaining units
  const handleSelectAll = () => {
    setReturnItems((prev) =>
      prev.map((item) => ({
        ...item,
        returned_quantity: item.remaining_to_return,
      }))
    );
  };

  // Quick action: Deselect / Clear all returns
  const handleClearAll = () => {
    setReturnItems((prev) =>
      prev.map((item) => ({
        ...item,
        returned_quantity: 0,
      }))
    );
  };

  const filteredReturnItems = returnItems.filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      (item.serial_number && item.serial_number.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q))
    );
  });

  const totalUnitsToReturn = returnItems.reduce((sum, i) => sum + (Number(i.returned_quantity) || 0), 0);
  const totalRemainingInOrder = returnItems.reduce((sum, i) => sum + (Number(i.remaining_to_return) || 0), 0);
  const totalPendingInOrder = returnItems.reduce((sum, i) => sum + (Number(i.pending_review_quantity) || 0), 0);
  const isOrderAlreadyCompleted =
    order?.status === 'completed' ||
    Boolean(order?.actual_returned_date) ||
    (totalRemainingInOrder <= 0 && totalPendingInOrder <= 0);

  const photoValidation = validateReturnItemsPhotos(returnItems);
  const attachedPhotosCount =
    photoValidation.itemsToProcess.length - photoValidation.missingPhotoItems.length;

  const handleReturnSubmit = async (e) => {
    e.preventDefault();

    if (isOrderAlreadyCompleted) {
      toast.error(t('checkouts.toasts.alreadyReturned'));
      onClose();
      return;
    }

    if (!profile?.signature_url) {
      toast.error(t('profile.signatureRequired', 'กรุณาเพิ่มลายเซ็นก่อนทำรายการ'));
      setShowSigModal(true);
      return;
    }

    const itemsToProcess = returnItems.filter((i) => Number(i.returned_quantity) > 0);
    if (itemsToProcess.length === 0) {
      return toast.error(t('checkouts.toasts.specifyReturnQty'));
    }

    for (const item of itemsToProcess) {
      const qty = Number(item.returned_quantity);
      if (qty <= 0) {
        return toast.error(t('checkouts.toasts.returnQtyPositive', { item: item.item_name }));
      }
      if (qty > item.remaining_to_return) {
        return toast.error(
          t('checkouts.toasts.returnQtyExceeds', {
            item: item.item_name,
            remaining: item.remaining_to_return,
            unit: item.unit,
          })
        );
      }
      // "นำไปใช้งานทดแทน" must always carry a reason so it can be audited later.
      if (item.condition === 'consumed' && !String(item.damage_notes || '').trim()) {
        return toast.error(t('checkouts.consumedReasonRequired'));
      }
    }

    // Requirement 1 & 2: Enforce 1 uploaded proof photo per returned item before submitting
    if (photoValidation.uploadingItems.length > 0) {
      return toast.error(t('checkouts.toasts.returnPhotoUploadingWait'));
    }

    if (photoValidation.missingPhotoItems.length > 0 || !photoValidation.isValid) {
      const firstMissing = photoValidation.missingPhotoItems[0] || photoValidation.errorItems[0];
      return toast.error(
        firstMissing
          ? t('checkouts.toasts.returnPhotoRequired', { item: firstMissing.item_name })
          : t('checkouts.toasts.returnPhotosIncomplete')
      );
    }

    try {
      setSubmitting(true);
      const payload = {
        order_id: order.id,
        received_by: profile?.id || null,
        returns: itemsToProcess.map((i) => ({
          checkout_item_id: i.checkout_item_id,
          returned_quantity: Number(i.returned_quantity),
          condition: i.condition,
          destination_project_id: i.destination_project_id || order.project_id,
          damage_notes: i.damage_notes?.trim() || null,
          replaced_serial_number: i.replaced_serial_number?.trim() || null,
          returned_serial_number: i.returned_serial_number?.trim() || null,
          evidence_photo_url: i.evidence_photo_url.trim(),
        })),
      };

      const { data, error } = await supabase.rpc('process_return_order', {
        p_payload: payload,
      });

      if (error) throw error;

      if (data?.pending_review) {
        toast.success(t('checkouts.toasts.returnSubmittedPendingReview'));
      } else {
        toast.success(
          data?.completed
            ? t('checkouts.toasts.allReturnedSuccess')
            : t('checkouts.toasts.partialReturnedSuccess')
        );
      }

      if (onReturnSuccess) onReturnSuccess(data);
      onClose();
    } catch (err) {
      console.error('Return error:', err);
      toast.error(err.message || t('checkouts.toasts.returnFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-165 rounded-xl bg-card p-6 border border-border shadow-xl">
          <form onSubmit={handleReturnSubmit} className="space-y-4">
            <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                    <span>{t('checkouts.returnEquipment')}</span>
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                      {order.order_number}
                    </span>
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>
                      {t('checkouts.borrower')}: <strong className="text-foreground">{order.borrower_name}</strong>
                    </span>
                    {order.borrower_department && <span>({order.borrower_department})</span>}
                    <span>•</span>
                    <span>
                      {t('items.location')}: <strong className="text-foreground">{order.projects?.name}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Already Returned Alert Banner */}
            {isOrderAlreadyCompleted && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-bold">{t('checkouts.fullyReturned')}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('checkouts.fullyReturnedDesc')}</p>
                </div>
              </div>
            )}

            {/* All Remaining Units Pending Admin Review Banner */}
            {!isOrderAlreadyCompleted && totalRemainingInOrder <= 0 && totalPendingInOrder > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                <Clock className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-bold">{t('checkouts.pendingReturnReviewStatus')}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('checkouts.awaitingAdminReturnConfirmNotice')}
                  </p>
                </div>
              </div>
            )}

            {/* Search & Quick Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-muted/20 p-2.5 rounded-xl border border-border/40">
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('common.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {t('checkouts.returnAll')} ({totalRemainingInOrder})
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive rounded-lg"
                >
                  {t('common.reset')}
                </Button>
              </div>
            </div>

            {/* Line Items Return List */}
            <div className="space-y-3 max-h-95 overflow-y-auto pr-1">
              {filteredReturnItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">{t('common.notFound')}</div>
              ) : (
                filteredReturnItems.map((item) => {
                  const isReturning = Number(item.returned_quantity) > 0;
                  const hasPhoto = Boolean(item.evidence_photo_url);
                  const fileInputId = `return-photo-${item.checkout_item_id}`;

                  return (
                    <div
                      key={item.checkout_item_id}
                      className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                        isReturning
                          ? 'bg-emerald-500/5 dark:bg-emerald-950/15 border-emerald-500/30'
                          : 'bg-card/60 border-border/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-xs text-foreground line-clamp-1">{item.item_name}</p>
                            {item.serial_number && (
                              <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                <span>S/N: {item.serial_number}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono flex-wrap">
                            <span>
                              {t('checkouts.borrowQty')}: {item.quantity_borrowed} {item.unit}
                            </span>
                            <span>•</span>
                            <span>
                              {t('stockIn.qtySourceRemaining', 'Outstanding')}:{' '}
                              <strong className="text-indigo-600 dark:text-indigo-400">
                                {item.remaining_to_return} {item.unit}
                              </strong>
                            </span>
                            {item.pending_review_quantity > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 dark:text-amber-400 font-bold">
                                  {t('checkouts.pendingReviewQtyLabel')}: {item.pending_review_quantity} {item.unit}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {item.remaining_to_return === 0 ? (
                          item.pending_review_quantity > 0 ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              <span>{t('checkouts.pendingReturnReviewStatus')}</span>
                            </span>
                          ) : (
                            <StatusBadge status="completed" size="sm" />
                          )
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleUpdateItem(
                                item.checkout_item_id,
                                'returned_quantity',
                                isReturning ? 0 : item.remaining_to_return
                              )
                            }
                            className={`h-7 px-2 text-[10px] font-bold rounded-lg flex items-center gap-1 ${
                              isReturning
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-muted text-muted-foreground hover:bg-emerald-500 hover:text-white'
                            }`}
                          >
                            {isReturning ? (
                              <>
                                <Check className="w-3 h-3 inline" />
                                <span>{t('common.confirm')}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3 inline" />
                                <span>{t('common.select')}</span>
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {item.remaining_to_return > 0 && (
                        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-border/40 items-center">
                          {/* Return Quantity */}
                          <div className="col-span-4 space-y-0.5">
                            <Label className="text-[10px] font-bold text-foreground">
                              {t('checkouts.chooseReturnQty')}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              max={item.remaining_to_return}
                              value={item.returned_quantity}
                              onChange={(e) =>
                                handleUpdateItem(item.checkout_item_id, 'returned_quantity', e.target.value)
                              }
                              className="h-8 text-xs font-bold font-mono rounded-lg"
                            />
                          </div>

                          {/* Condition Selector */}
                          <div className="col-span-4 space-y-0.5">
                            <Label className="text-[10px] font-bold text-foreground">
                              {t('checkouts.condition')}
                            </Label>
                            <select
                              value={item.condition}
                              onChange={(e) =>
                                handleUpdateItem(item.checkout_item_id, 'condition', e.target.value)
                              }
                              className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                            >
                              <option value="normal">{t('checkouts.normal')}</option>
                              <option value="needs_repair">{t('checkouts.needsRepair')}</option>
                              <option value="damaged">{t('checkouts.damaged')}</option>
                              <option value="lost">{t('checkouts.lost')}</option>
                              <option value="consumed">{t('checkouts.consumed')}</option>
                            </select>
                          </div>

                          {/* Destination Warehouse */}
                          <div className="col-span-4 space-y-0.5">
                            <Label className="text-[10px] font-bold text-foreground">
                              {t('items.destLocation')}
                            </Label>
                            <select
                              value={item.destination_project_id}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.checkout_item_id,
                                  'destination_project_id',
                                  e.target.value
                                )
                              }
                              className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 cursor-pointer truncate"
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.location ? `${p.name} (${p.location})` : p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Returned serial number (when condition !== 'consumed') */}
                          {item.condition !== 'consumed' && (
                            <div className="col-span-12 space-y-1 pt-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-[10px] text-foreground font-bold flex items-center gap-1.5">
                                  <Barcode className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>{t('checkouts.returnedSerialNumber')}</span>
                                </Label>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground border border-border/50">
                                  {t('checkouts.returnedSerialOptional')}
                                </span>
                              </div>
                              <Input
                                placeholder={t('checkouts.returnedSerialPlaceholder')}
                                value={item.returned_serial_number ?? ''}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    item.checkout_item_id,
                                    'returned_serial_number',
                                    e.target.value.toUpperCase()
                                  )
                                }
                                maxLength={100}
                                className="h-8 text-xs rounded-lg font-mono"
                              />
                              {Number(item.returned_quantity) > 1 && (
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                  {t('checkouts.multiQtySerialHint')}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Replaced serial number (consumed = used as replacement) */}
                          {item.condition === 'consumed' && (
                            <div className="col-span-12 space-y-0.5 pt-1">
                              <Label className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                {t('checkouts.replacedSerial')}
                              </Label>
                              <Input
                                placeholder={t('checkouts.replacedSerialPlaceholder')}
                                value={item.replaced_serial_number}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    item.checkout_item_id,
                                    'replaced_serial_number',
                                    e.target.value
                                  )
                                }
                                maxLength={100}
                                className="h-8 text-xs rounded-lg"
                              />
                            </div>
                          )}

                          {/* Damage Note if not normal — mandatory reason when consumed */}
                          {item.condition !== 'normal' && (
                            <div className="col-span-12 space-y-0.5 pt-1">
                              <Label className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                {item.condition === 'consumed'
                                  ? t('checkouts.consumedReason')
                                  : t('checkouts.conditionNotes')}
                              </Label>
                              <Input
                                placeholder={
                                  item.condition === 'consumed'
                                    ? t('checkouts.consumedReasonPlaceholder')
                                    : t('checkouts.conditionNotesPlaceholder')
                                }
                                value={item.damage_notes}
                                onChange={(e) =>
                                  handleUpdateItem(item.checkout_item_id, 'damage_notes', e.target.value)
                                }
                                className={`h-8 text-xs rounded-lg ${
                                  item.condition === 'consumed' ? 'border-amber-500/50' : ''
                                }`}
                              />
                              {item.condition === 'consumed' && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                  {t('checkouts.consumedNoStockNote')}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Mandatory Proof-of-Return Photo Upload (1 Photo per Returned Item) */}
                          {isReturning && (
                            <div className="col-span-12 pt-2 border-t border-border/40 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <Label
                                  htmlFor={fileInputId}
                                  className="text-[10px] font-bold text-foreground flex items-center gap-1.5"
                                >
                                  <Camera className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>{t('checkouts.returnProofPhotoLabel')}</span>
                                  <span className="text-destructive">*</span>
                                </Label>

                                {hasPhoto ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{t('checkouts.returnProofPhotoAttachedBadge')}</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                    {t('checkouts.returnProofPhotoRequiredBadge')}
                                  </span>
                                )}
                              </div>

                              <input
                                id={fileInputId}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/*"
                                capture="environment"
                                disabled={item.photoUploading || submitting}
                                onChange={(e) => {
                                  const selectedFile = e.target.files?.[0];
                                  e.target.value = '';
                                  if (selectedFile) {
                                    handlePhotoUpload(item.checkout_item_id, selectedFile);
                                  }
                                }}
                                className="sr-only"
                              />

                              {item.photoUploading ? (
                                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300">
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                  <span className="font-semibold">
                                    {t('checkouts.compressingAndUploadingPhoto')}
                                  </span>
                                </div>
                              ) : hasPhoto ? (
                                <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-background border border-emerald-500/30">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewPhotoItem(item)}
                                      className="relative w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0 group cursor-pointer"
                                      title={t('checkouts.viewReturnPhotoBtn')}
                                    >
                                      <img
                                        src={item.evidence_photo_url}
                                        alt={item.item_name}
                                        className="w-full h-full object-cover"
                                      />
                                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Eye className="w-3.5 h-3.5 text-white" />
                                      </span>
                                    </button>
                                    <div className="min-w-0 space-y-0.5">
                                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                                        {t('checkouts.returnProofPhotoAttachedBadge')}
                                      </p>
                                      {item.photoMeta && (
                                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                                          {t('checkouts.compressedSizeInfo', {
                                            original: formatFileSize(item.photoMeta.originalSize),
                                            compressed: formatFileSize(item.photoMeta.compressedSize),
                                            width: item.photoMeta.width,
                                            height: item.photoMeta.height,
                                          })}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setPreviewPhotoItem(item)}
                                      className="h-7 px-2 text-[10px] font-semibold rounded-md gap-1 cursor-pointer"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span className="hidden sm:inline">{t('checkouts.viewReturnPhotoBtn')}</span>
                                    </Button>
                                    <label
                                      htmlFor={fileInputId}
                                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background hover:bg-accent text-[10px] font-semibold cursor-pointer"
                                    >
                                      <Camera className="w-3 h-3" />
                                      <span>{t('checkouts.changeReturnPhotoBtn')}</span>
                                    </label>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemovePhoto(item.checkout_item_id)}
                                      className="h-7 px-2 text-[10px] text-destructive hover:bg-destructive/10 rounded-md cursor-pointer"
                                      title={t('checkouts.removeReturnPhotoBtn')}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label
                                      htmlFor={fileInputId}
                                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold cursor-pointer transition-colors"
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                      <span>{t('checkouts.uploadReturnPhotoBtn')}</span>
                                    </label>

                                    {item.photoError && item.photoRawFile && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handlePhotoUpload(item.checkout_item_id, item.photoRawFile)
                                        }
                                        className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg border-amber-500/40 text-amber-700 dark:text-amber-300 cursor-pointer"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>{t('checkouts.retryUploadPhotoBtn')}</span>
                                      </Button>
                                    )}
                                  </div>

                                  {item.photoError && (
                                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
                                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                      <span>{item.photoError}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Photo Verification Progress Banner */}
            {photoValidation.itemsToProcess.length > 0 && !isOrderAlreadyCompleted && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                  photoValidation.isValid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                }`}
              >
                {photoValidation.isValid ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Camera className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <span className="font-semibold">
                  {photoValidation.isValid
                    ? t('checkouts.allPhotosAttachedReady', {
                        total: photoValidation.itemsToProcess.length,
                      })
                    : t('checkouts.missingPhotoWarning', {
                        attached: attachedPhotosCount,
                        total: photoValidation.itemsToProcess.length,
                      })}
                </span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 border-t border-border/40 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-lg h-9 px-4 text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel')}
              </Button>

              <Button
                type="submit"
                disabled={
                  submitting ||
                  totalUnitsToReturn === 0 ||
                  isOrderAlreadyCompleted ||
                  !photoValidation.isValid
                }
                className="rounded-lg h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? t('common.pleaseWait')
                    : `${t('checkouts.submitReturnBtn')} (${totalUnitsToReturn} ${
                        totalUnitsToReturn === 1
                          ? t('checkouts.unitCount_one')
                          : t('checkouts.unitCount_other')
                      })`}
                </span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>

        <SignatureRequiredModal isOpen={showSigModal} onClose={() => setShowSigModal(false)} />
      </Dialog>

      {/* Full-size Photo Preview Modal */}
      <Dialog
        open={Boolean(previewPhotoItem)}
        onOpenChange={(open) => !open && setPreviewPhotoItem(null)}
      >
        <DialogContent className="sm:max-w-lg rounded-xl bg-card p-5 border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-500" />
              <span>
                {t('checkouts.returnPhotoPreviewTitle')} — {previewPhotoItem?.item_name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {previewPhotoItem?.evidence_photo_url && (
            <div className="rounded-xl overflow-hidden border border-border bg-black/5 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewPhotoItem.evidence_photo_url}
                alt={previewPhotoItem.item_name}
                className="max-w-full max-h-[65vh] object-contain"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewPhotoItem(null)}
              className="rounded-lg text-xs font-semibold cursor-pointer"
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CheckoutReturnModal;
