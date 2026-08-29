import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ShoppingCart, Trash2, Plus, Minus, ChevronDown, ChevronUp, 
  Building2, Send, MapPin, FileText, X
} from 'lucide-react';
import toast from 'react-hot-toast';

const QUICK_PURPOSE_TAGS = [
  'งานซ่อมบำรุง / PM',
  'ติดตั้งโครงการใหม่',
  'สำรองใช้งานฉุกเฉิน',
  'ทดสอบระบบ / QC',
  'เปลี่ยนอุปกรณ์ชำรุด'
];

const QUICK_DELIVERY_TAGS = [
  'Forth (EMS)',
  'Forth (Office)',
  'Site งาน / โครงการ',
  'ขนส่งเอกชน (Kerry/Flash)'
];

const WithdrawalCartPanel = ({
  cart = [],
  projects = [],
  selectedProjectId,
  onSelectProject,
  onUpdateQuantity,
  onDirectQuantityChange,
  onQuantityBlur,
  onRemoveFromCart,
  onClearCart,
  onUpdateItemDetails,
  onSubmitOrder,
  isSubmitting = false
}) => {
  const [purpose, setPurpose] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expandedItemId, setExpandedItemId] = useState(null);

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
      toast.error('กรุณาเลือกวัสดุในตะกร้าก่อนส่งคำขอ');
      return;
    }

    if (!isValidProject) {
      toast.error('กรุณาเลือกสถานที่จัดเก็บ (Location) ที่จะนำไปใช้งาน');
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
          <div className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-foreground tracking-tight">
              ตะกร้าคำขอเบิกจ่าย
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {totalItemsCount} รายการ ({totalUnits} ชิ้น)
            </p>
          </div>
        </div>

        {cart.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClearCart}
            className="text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl px-2.5 h-7 gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>ล้างทั้งหมด</span>
          </Button>
        )}
      </div>

      {/* Target Project Validation Notice */}
      <div className={`p-3 rounded-2xl border transition-all text-xs ${
        isValidProject
          ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-900 dark:text-indigo-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 animate-pulse'
      }`}>
        <div className="flex items-start gap-2">
          <Building2 className={`w-4 h-4 shrink-0 mt-0.5 ${isValidProject ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-bold flex items-center justify-between">
              <span>สถานที่จัดเก็บ (Location):</span>
              {!isValidProject && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold">* จำเป็นต้องเลือก</span>}
            </div>
            {isValidProject ? (
              <p className="font-semibold truncate text-foreground mt-0.5">
                {selectedProject?.project_code ? `[${selectedProject.project_code}] ` : ''}{selectedProject?.name}
                {selectedProject?.location && <span className="text-muted-foreground font-normal"> ({selectedProject.location})</span>}
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                กรุณาเลือกสถานที่จัดเก็บที่แถบด้านบน เพื่อตัดสต็อกให้ถูกต้อง
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cart Items List Container */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[380px] scrollbar-thin">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/70 space-y-2 border-2 border-dashed border-border/60 rounded-3xl bg-muted/10 my-4">
            <ShoppingCart className="w-10 h-10 opacity-30 stroke-1" />
            <p className="text-xs font-bold text-foreground">ยังไม่มีรายการในตะกร้า</p>
            <p className="text-[11px] text-muted-foreground max-w-[220px]">
              คลิกปุ่ม &quot;+ เพิ่มในคำขอ&quot; บนการ์ดวัสดุด้านซ้ายเพื่อเริ่มสร้างรายการเบิก
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
                className="p-3 rounded-2xl bg-card border border-border/60 shadow-2xs space-y-2 transition-all hover:border-indigo-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-foreground line-clamp-1">{item.name}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span>{item.sku || 'NO SKU'}</span>
                      <span>•</span>
                      <span>{item.unit || 'ชิ้น'}</span>
                      {item.balance !== undefined && (
                        <>
                          <span>•</span>
                          <span className={item.balance > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500 font-semibold'}>
                            คลังนี้: {item.balance}
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
                    title="ลบรายการนี้"
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
                    <span>{hasDetails ? 'แก้ไข S/N / Part No. (ระบุแล้ว)' : '+ ระบุ S/N / Part Number (ถ้ามี)'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50 space-y-2 text-xs animate-in fade-in-50 duration-150">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Part Number</label>
                        <Input
                          className="h-8 text-xs rounded-lg bg-background"
                          placeholder="เช่น PN-990-AB"
                          value={item.part_number || ''}
                          onChange={(e) => onUpdateItemDetails(item.id, 'part_number', e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          Serial Number (คั่นด้วยเครื่องหมายจุลภาค ,)
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

      {/* Requisition Context Inputs (Purpose & Single Consolidated Delivery Destination) */}
      <div className="border-t border-border/40 pt-3 space-y-3">
        {/* Purpose Input & Tags */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>วัตถุประสงค์การขอเบิก</span>
            </label>
            <span className="text-[10px] text-muted-foreground">กดแท็กด่วนด้านล่างได้</span>
          </div>

          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="เช่น ใช้สำหรับซ่อมบำรุงสถานีฐาน..."
            className="h-9 text-xs rounded-xl bg-background border-border/60 focus:ring-2 focus:ring-indigo-500"
          />

          {/* Quick Purpose Tag Pills */}
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

        {/* Consolidated Single Dynamic Delivery Destination Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>สถานที่จัดส่ง / จุดส่งมอบ (Delivery Destination)</span>
            </label>
            <span className="text-[10px] text-muted-foreground">เลือกแท็กหรือพิมพ์เองได้</span>
          </div>

          <div className="relative">
            <Input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="เลือกจากแท็กด้านล่าง หรือพิมพ์สถานที่จัดส่ง / ชื่อผู้รับ..."
              className="h-9 pr-7 text-xs rounded-xl bg-background border-border/60 focus:ring-2 focus:ring-indigo-500"
            />
            {deliveryAddress && (
              <button
                type="button"
                onClick={() => setDeliveryAddress('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                title="ล้างค่า"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Delivery Destination Tag Pills */}
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
          className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <span>กำลังส่งคำขอเบิกจ่าย...</span>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>ส่งคำขอเบิกจ่าย ({totalUnits} ชิ้น)</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default WithdrawalCartPanel;
