import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ShoppingCart, Trash2, Plus, Minus, ChevronDown, ChevronUp, 
  Building2, Send, MapPin, FileText, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';

const WithdrawalCartPanel = ({
  cart = [],
  projects = [],
  selectedProjectId,
  onSelectProject: _onSelectProject,
  onUpdateQuantity,
  onDirectQuantityChange,
  onQuantityBlur,
  onRemoveFromCart,
  onClearCart,
  onUpdateItemDetails,
  onSubmitOrder,
  isSubmitting = false
}) => {
  const { t } = useTranslation();
  const [purpose, setPurpose] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expandedItemId, setExpandedItemId] = useState(null);

  const QUICK_PURPOSE_TAGS = [
    t('withdrawals.purposeTag1', 'Maintenance / PM'),
    t('withdrawals.purposeTag2', 'New Project Installation'),
    t('withdrawals.purposeTag3', 'Emergency Backup'),
    t('withdrawals.purposeTag4', 'System Testing / QC'),
    t('withdrawals.purposeTag5', 'Replace Damaged Equipment')
  ];

  const QUICK_DELIVERY_TAGS = [
    t('withdrawals.deliveryTag1', 'Forth (EMS)'),
    t('withdrawals.deliveryTag2', 'Forth (Office)'),
    t('withdrawals.deliveryTag3', 'Job Site / Project'),
    t('withdrawals.deliveryTag4', 'Private Courier (Kerry/Flash)')
  ];

  const totalItemsCount = cart.length;
  const totalUnits = cart.reduce((sum, item) => {
    const q = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 1;
    return sum + q;
  }, 0);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const isValidProject = Boolean(selectedProjectId && selectedProjectId !== 'all');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error(t('withdrawals.selectItemsFirst', 'Please select items before submitting'));
      return;
    }

    if (!isValidProject) {
      toast.error(t('withdrawals.selectLocation', 'Please select a destination storage location'));
      return;
    }

    onSubmitOrder({
      projectId: selectedProjectId,
      purpose: purpose.trim(),
      deliveryAddress: deliveryAddress.trim()
    });
  };

  const toggleExpand = (id) => {
    setExpandedItemId(prev => prev === id ? null : id);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-4">
      {/* Cart Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-foreground tracking-tight">
              {t('withdrawals.requisitionCart', 'Requisition Cart')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {totalItemsCount} {t('common.items', 'items')} ({totalUnits} {t('common.defaultUnit', 'pcs')})
            </p>
          </div>
        </div>

        {cart.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClearCart}
            className="text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg px-2.5 h-7 gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('withdrawals.clearAll', 'Clear All')}</span>
          </Button>
        )}
      </div>

      {/* Target Project Validation Notice */}
      <div className={`p-3 rounded-xl border transition-all text-xs ${
        isValidProject
          ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-900 dark:text-indigo-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 animate-pulse'
      }`}>
        <div className="flex items-start gap-2">
          <Building2 className={`w-4 h-4 shrink-0 mt-0.5 ${isValidProject ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-bold flex items-center justify-between">
              <span>{t('common.location', 'Location')}:</span>
              {!isValidProject && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold">* {t('common.required', 'Required')}</span>}
            </div>
            {isValidProject ? (
              <p className="font-semibold truncate text-foreground mt-0.5">
                {selectedProject?.project_code ? `[${selectedProject.project_code}] ` : ''}{selectedProject?.name}
                {selectedProject?.location && <span className="text-muted-foreground font-normal"> ({selectedProject.location})</span>}
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                {t('withdrawals.selectLocationNotice', 'Please select a storage location above to deduct stock accurately.')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cart Items List Container */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[380px] scrollbar-thin">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/70 space-y-2 border-2 border-dashed border-border/60 rounded-xl bg-muted/10 my-4">
            <ShoppingCart className="w-10 h-10 opacity-30 stroke-1" />
            <p className="text-xs font-bold text-foreground">{t('withdrawals.cartEmpty', 'Your cart is empty')}</p>
            <p className="text-[11px] text-muted-foreground max-w-[220px]">
              {t('withdrawals.cartEmptyHint', 'Click "+ Add to Request" on an item card to start adding items.')}
            </p>
          </div>
        ) : (
          cart.map(item => {
            const availableStock = item.balance !== undefined ? item.balance : Infinity;
            const isExpanded = expandedItemId === item.id;
            const hasDetails = Boolean(item.part_number || item.serial_number);

            return (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-card border border-border shadow-2xs space-y-2 transition-all hover:border-indigo-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-foreground line-clamp-1">{item.name}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span>{item.sku || t('items.noSku', 'NO SKU')}</span>
                      <span>•</span>
                      <span>{item.unit || t('common.defaultUnit', 'pcs')}</span>
                      {item.balance !== undefined && (
                        <>
                          <span>•</span>
                          <span className={item.balance > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500 font-semibold'}>
                            {t('withdrawals.inThisLocation', 'In this location')}: {item.balance}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper & Input */}
                  <div className="flex items-center border border-border/60 rounded-xl overflow-hidden bg-background shadow-2xs shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none hover:bg-muted text-muted-foreground cursor-pointer"
                      onClick={() => onUpdateQuantity(item.id, -1)}
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-11 h-7 text-center font-mono text-xs font-bold bg-transparent border-none focus:outline-none p-0 text-foreground"
                      value={item.quantityInput !== undefined ? item.quantityInput : String(item.quantity)}
                      onChange={(e) => onDirectQuantityChange(item.id, e.target.value)}
                      onBlur={() => onQuantityBlur(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none hover:bg-muted text-muted-foreground cursor-pointer"
                      onClick={() => onUpdateQuantity(item.id, 1)}
                      disabled={item.quantity >= availableStock}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg shrink-0 cursor-pointer"
                    onClick={() => onRemoveFromCart(item.id)}
                    title={t('withdrawals.removeItem', 'Remove item')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Toggle S/N & Part Number Details */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className={`text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                      hasDetails
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span>{hasDetails ? t('withdrawals.editSnPartNo', 'Edit S/N / Part No. (Specified)') : t('withdrawals.specifySnPartNo', '+ Specify S/N / Part Number (Optional)')}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50 space-y-2 text-xs animate-in fade-in-50 duration-150">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">{t('withdrawals.partNumber', 'Part Number')}</label>
                        <Input
                          className="h-8 text-xs rounded-lg bg-background"
                          placeholder="e.g. PN-990-AB"
                          value={item.part_number || ''}
                          onChange={(e) => onUpdateItemDetails(item.id, 'part_number', e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          {t('withdrawals.serialNumber', 'Serial Number')} (comma separated ,)
                        </label>
                        <textarea
                          className="flex min-h-[48px] w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                          placeholder="SN001, SN002, SN003..."
                          value={item.serial_number || ''}
                          onChange={(e) => onUpdateItemDetails(item.id, 'serial_number', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Requisition Context Inputs */}
      <div className="border-t border-border/40 pt-3 space-y-3">
        {/* Purpose Input & Tags */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('withdrawals.requisitionPurpose', 'Requisition Purpose')}</span>
            </label>
            <span className="text-[10px] text-muted-foreground">{t('withdrawals.quickTagsBelow', 'Quick tags below')}</span>
          </div>

          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t('withdrawals.purposePlaceholder', 'e.g. Base station maintenance...')}
            className="h-9 text-xs rounded-lg bg-background border-border focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex flex-wrap gap-1 pt-0.5">
            {QUICK_PURPOSE_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setPurpose(tag)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-muted/60 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 border border-border/50 transition-all cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Delivery Destination Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('withdrawals.deliveryDestination', 'Delivery Destination')}</span>
            </label>
            <span className="text-[10px] text-muted-foreground">{t('withdrawals.selectTagOrCustom', 'Select tag or enter custom')}</span>
          </div>

          <div className="relative">
            <Input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder={t('withdrawals.deliveryPlaceholder', 'Select from tags below or enter destination / recipient...')}
              className="h-9 pr-7 text-xs rounded-lg bg-background border-border focus:ring-2 focus:ring-indigo-500"
            />
            {deliveryAddress && (
              <button
                type="button"
                onClick={() => setDeliveryAddress('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                title={t('common.clearSearch', 'Clear')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1 pt-0.5">
            {QUICK_DELIVERY_TAGS.map(tag => {
              const isSelected = deliveryAddress === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setDeliveryAddress(isSelected ? '' : tag)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-muted/60 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 border border-border/50'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Submit Action Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={cart.length === 0 || !isValidProject || isSubmitting}
          className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <span>{t('withdrawals.submitting', 'Submitting requisition request...')}</span>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>{t('withdrawals.submitRequisition', 'Submit Requisition')} ({totalUnits} {t('common.defaultUnit', 'pcs')})</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default WithdrawalCartPanel;
