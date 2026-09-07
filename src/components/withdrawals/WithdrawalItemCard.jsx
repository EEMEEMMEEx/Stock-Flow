import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Plus, Minus, Check, Building2 } from 'lucide-react';

const WithdrawalItemCard = React.memo(({
  item,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onOpenLocationBreakdown
}) => {
  const availableStock = item.balance !== undefined ? item.balance : Infinity;
  const totalSys = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;
  const isOutOfStock = availableStock <= 0;
  const hasStockInOtherWarehouse = isOutOfStock && totalSys > 0;
  const isLowStock = availableStock > 0 && availableStock <= 5;
  const completelyEmpty = isOutOfStock && totalSys <= 0;

  const isInCart = Boolean(cartItem);
  const cartQuantity = cartItem?.quantity || 0;

  return (
    <Card
      className={`p-3.5 rounded-xl bg-card border shadow-xs transition-colors flex flex-col justify-between relative overflow-hidden group select-none ${
        isInCart
          ? 'ring-2 ring-indigo-500 border-indigo-500/50 bg-indigo-500/5 dark:bg-indigo-950/20 shadow-xs'
          : completelyEmpty
            ? 'opacity-40 bg-muted/20 border-border/40'
            : 'hover:border-indigo-500/40 border-border shadow-xs'
      }`}
    >
      {/* Top Left: In-Cart Ribbon Indicator */}
      {isInCart && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-extrabold font-mono bg-indigo-600 text-white shadow-xs flex items-center gap-1">
          <Check className="w-3 h-3 stroke-[2.5]" />
          <span>{cartQuantity} ในคำขอ</span>
        </div>
      )}

      <div className="space-y-2.5">
        {/* Product Image & Stock Badge Overlay */}
        <div className="aspect-square bg-muted/30 dark:bg-muted/10 rounded-lg flex items-center justify-center p-3 relative overflow-hidden border border-border group-hover:border-indigo-500/30 transition-colors">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="object-contain w-full h-full"
              loading="lazy"
            />
          ) : (
            <Package className="w-10 h-10 text-muted-foreground/30 stroke-[1.5]" />
          )}

          {/* Stock Level Badge */}
          {item.balance !== undefined && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasStockInOtherWarehouse || totalSys > 0) {
                  onOpenLocationBreakdown(item);
                }
              }}
              title="คลิกเพื่อดูสต็อกแยกรายคลัง"
              className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold font-mono shadow-xs transition-colors cursor-pointer ${
                isLowStock
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                  : availableStock > 0
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : hasStockInOtherWarehouse
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                      : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {isLowStock
                ? `เหลือน้อย (${availableStock})`
                : availableStock > 0
                  ? `คงเหลือ ${availableStock} ${item.unit || ''}`
                  : hasStockInOtherWarehouse
                    ? `มีคลังอื่น (${totalSys})`
                    : 'ของหมด'}
            </button>
          )}
        </div>

        {/* Item Information */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            <span className="truncate max-w-[120px]">{item.sku && item.sku !== '-' ? item.sku : 'NO SKU'}</span>
            {item.model && item.model !== '-' && (
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate max-w-[100px]">
                {item.model}
              </span>
            )}
          </div>
          <h3 className="font-bold text-xs line-clamp-2 leading-snug text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {item.name}
          </h3>
        </div>
      </div>

      {/* Footer Controls & Stepper */}
      <div className="mt-3 pt-2.5 border-t border-border/40 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
          <span>หน่วย: <strong className="text-foreground">{item.unit || 'ชิ้น'}</strong></span>
          {hasStockInOtherWarehouse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLocationBreakdown(item);
              }}
              className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <Building2 className="w-3 h-3" /> ดูคลังอื่น
            </button>
          )}
        </div>

        {/* Action Button or In-Card Stepper */}
        {isInCart ? (
          <div className="flex items-center justify-between bg-muted/60 dark:bg-muted/30 border border-border rounded-lg p-1 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onUpdateQuantity(item.id, -1)}
              className="h-7 w-7 rounded hover:bg-background text-foreground shrink-0 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            
            <span className="font-mono text-xs font-bold text-foreground px-2">
              {cartQuantity} {item.unit || 'ชิ้น'}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={cartQuantity >= availableStock}
              onClick={() => onUpdateQuantity(item.id, 1)}
              className="h-7 w-7 rounded hover:bg-background text-foreground shrink-0 disabled:opacity-30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            disabled={completelyEmpty || isOutOfStock}
            onClick={() => {
              if (isOutOfStock && hasStockInOtherWarehouse) {
                onOpenLocationBreakdown(item);
              } else {
                onAddToCart(item);
              }
            }}
            className={`w-full h-8 rounded-lg text-xs font-semibold gap-1.5 transition-all shadow-2xs cursor-pointer ${
              isOutOfStock && hasStockInOtherWarehouse
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : completelyEmpty
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isOutOfStock && hasStockInOtherWarehouse ? (
              <>
                <Building2 className="w-3.5 h-3.5" />
                <span>ดูคลังที่มีของ</span>
              </>
            ) : completelyEmpty ? (
              <span>สินค้าหมด</span>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มในคำขอ</span>
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
});

WithdrawalItemCard.displayName = 'WithdrawalItemCard';

export default WithdrawalItemCard;
