import React, { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, Package, 
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  AlertCircle, RotateCcw, Check, LayoutGrid, List, X
} from 'lucide-react';
import toast from 'react-hot-toast';

const getStockMeta = (item) => {
  const availableStock = item.balance !== undefined ? item.balance : Infinity;
  const totalSystemBalance = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;
  const isOutOfStock = availableStock <= 0;
  const hasStockInOtherWarehouse = isOutOfStock && totalSystemBalance > 0;
  const isLowStock = availableStock > 0 && availableStock <= 5;
  const completelyEmpty = isOutOfStock && totalSystemBalance <= 0;

  return {
    availableStock,
    totalSystemBalance,
    hasStockInOtherWarehouse,
    isLowStock,
    completelyEmpty,
  };
};

// Modularized PosItemCard Subcomponent
const PosItemCard = React.memo(({ item, isStockIn, cart, addToCart }) => {
  const { availableStock, totalSystemBalance, hasStockInOtherWarehouse, isLowStock, completelyEmpty } = getStockMeta(item);

  const cartItem = cart.find(c => c.id === item.id);
  const isInCart = Boolean(cartItem);

  return (
    <Card
      role="button"
      tabIndex={completelyEmpty ? -1 : 0}
      aria-disabled={completelyEmpty}
      aria-label={`${item.name}${item.sku ? `, SKU ${item.sku}` : ''}. ${isInCart ? `เลือกแล้ว ${cartItem.quantity} ${item.unit || 'หน่วย'}` : 'เพิ่มลงในตะกร้า'}`}
      onKeyDown={(event) => {
        if (!completelyEmpty && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          addToCart(item);
        }
      }}
      className={`min-h-[250px] p-3.5 rounded-2xl neu-flat border-0 transition-[box-shadow,border-color,background-color,transform] duration-200 flex flex-col justify-between relative overflow-hidden group select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        isInCart
          ? 'neu-pressed ring-2 ring-indigo-500 border-indigo-500/50 bg-indigo-500/5 dark:bg-indigo-950/20 cursor-pointer'
          : completelyEmpty 
            ? 'opacity-50 cursor-not-allowed bg-muted/20 border-border/40'
            : 'cursor-pointer hover:shadow-md hover:border-indigo-500/40 border-border/60 active:scale-[0.99]'
      }`}
      onClick={() => addToCart(item)}
    >
      {/* Top In-Cart Selected Ribbon Badge */}
      {isInCart && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md text-[10px] font-extrabold font-mono bg-indigo-600 text-white shadow-2xs flex items-center gap-1">
          <Check className="w-3 h-3 stroke-[2.5]" />
          <span>{cartItem.quantity} ในตะกร้า</span>
        </div>
      )}

      <div className="space-y-2">
        {/* Image Preview & Stock Badge Bar */}
        <div className="aspect-[4/3] bg-muted/40 rounded-xl flex items-center justify-center p-3 relative overflow-hidden border border-border/40">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} loading="lazy" className="object-contain w-full h-full group-hover:scale-105 transition-transform" />
          ) : (
            <Package className="w-10 h-10 text-muted-foreground/30 stroke-[1.5]" />
          )}

          {/* Stock Level Badge */}
          {item.balance !== undefined && (
              <span className={`absolute top-2 right-2 max-w-[calc(100%-1rem)] truncate px-2 py-1 rounded-lg text-[10px] font-extrabold font-mono shadow-2xs backdrop-blur-xs ${
              isStockIn 
                ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30' 
                : isLowStock
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : availableStock > 0 
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                    : hasStockInOtherWarehouse 
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                      : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
            }`}>
              {isStockIn 
                ? `สต็อก: ${item.balance}` 
                : isLowStock
                  ? `เหลือน้อย (${availableStock})`
                  : availableStock > 0 
                    ? `คงเหลือ ${item.balance} ${item.unit || ''}` 
                    : hasStockInOtherWarehouse 
                      ? `มีคลังอื่น (${totalSystemBalance})`
                      : 'ของหมด'}
            </span>
          )}
        </div>

        {/* SKU & Name */}
        <div>
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            <span className="truncate">{item.sku && item.sku !== '-' ? item.sku : 'NO SKU'}</span>
            {item.model && item.model !== '-' && (
              <span className="lowercase text-indigo-600 dark:text-indigo-400 font-semibold">{item.model}</span>
            )}
          </div>
          <h3 className="font-bold text-sm line-clamp-2 leading-snug text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {item.name}
          </h3>
        </div>
      </div>

      {/* Footer Unit Info */}
      <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
        <span>หน่วย: {item.unit || 'ชิ้น'}</span>
        {hasStockInOtherWarehouse && (
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5">
            <AlertCircle className="w-3 h-3 stroke-[1.5]" /> ย้ายคลัง
          </span>
        )}
      </div>
    </Card>
  );
});
PosItemCard.displayName = 'PosItemCard';

const PosTerminal = ({ 
  title, 
  icon: Icon, 
  items = [], 
  categories = [], 
  onSubmit, 
  isLoading = false, 
  allowDeliveryDetails = false,
  isStockIn = false 
}) => {
  // Search & Filter & Density States
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'cross_warehouse' | 'out_of_stock'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Cart & Item Expanded Details States
  const [cart, setCart] = useState([]);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const [pageInput, setPageInput] = useState('1');

  // Multi-tier filtering
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = 
        !search ||
        (item.name && item.name.toLowerCase().includes(search.toLowerCase())) || 
        (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
        (item.model && item.model.toLowerCase().includes(search.toLowerCase()));

      const matchCategory = selectedCategory === 'all' || item.category_id === selectedCategory;

      const availableStock = item.balance !== undefined ? item.balance : Infinity;
      const totalSys = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;
      const isOutOfStock = availableStock <= 0;
      const hasStockInOtherWarehouse = isOutOfStock && totalSys > 0;
      const isLowStock = availableStock > 0 && availableStock <= 5;

      let matchStock = true;
      if (stockStatusFilter === 'in_stock') {
        matchStock = availableStock > 0;
      } else if (stockStatusFilter === 'low_stock') {
        matchStock = isLowStock;
      } else if (stockStatusFilter === 'cross_warehouse') {
        matchStock = hasStockInOtherWarehouse;
      } else if (stockStatusFilter === 'out_of_stock') {
        matchStock = isOutOfStock && totalSys <= 0;
      }

      return matchSearch && matchCategory && matchStock;
    });
  }, [items, search, selectedCategory, stockStatusFilter]);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
    setPageInput('1');
  }, [search, selectedCategory, stockStatusFilter, rowsPerPage]);

  // Pagination Calculations
  const totalRecords = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
  const paginatedItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, startIndex, endIndex]);

  // Clamp current page if totalPages reduces
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(String(totalPages));
    }
  }, [totalPages, currentPage]);

  const handlePageInputChange = (e) => {
    const val = e.target.value;
    setPageInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      setCurrentPage(num);
    }
  };

  const handlePageInputBlur = () => {
    const num = parseInt(pageInput, 10);
    if (isNaN(num) || num < 1) {
      setCurrentPage(1);
      setPageInput('1');
    } else if (num > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(String(totalPages));
    } else {
      setCurrentPage(num);
      setPageInput(String(num));
    }
  };

  // Cart operations
  const addToCart = (item) => {
    const availableStock = item.balance !== undefined ? item.balance : Infinity;
    const totalSys = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;

    if (!isStockIn && availableStock <= 0) {
      if (totalSys > 0) {
        toast.error(
          `วัสดุนี้ไม่มีสต็อกในคลังที่เลือก แต่มีในคลังย่อยอื่นรวม ${totalSys} ${item.unit || 'หน่วย'}\nกรุณาเปลี่ยน "โครงการเบิกสินค้า" ให้ตรงกับคลังที่มีสต็อก`
        );
      } else {
        toast.error('วัสดุนี้ของหมดทั้งระบบ');
      }
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        if (!isStockIn && existing.quantity >= availableStock) {
          toast.error(`ไม่สามารถเบิกเกินสต็อกที่มีในคลังนี้ได้ (${availableStock} ${item.unit || 'หน่วย'})`);
          return prev;
        }
        const newQ = existing.quantity + 1;
        return prev.map(i => i.id === item.id ? { ...i, quantity: newQ, quantityInput: String(newQ) } : i);
      }
      return [...prev, { ...item, quantity: 1, quantityInput: '1', delivery_to: '', serial_number: '', part_number: '' }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;
        const currentQ = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : (parseInt(item.quantityInput, 10) || 1);
        let newQ = currentQ + delta;

        if (!isStockIn && newQ > availableStock) {
          toast.error(`จำกัดสูงสุดเท่าสต็อกคงเหลือ (${availableStock} ${item.unit || 'หน่วย'})`);
          newQ = availableStock;
        }
        if (newQ < 1) newQ = 1;

        return { ...item, quantity: newQ, quantityInput: String(newQ) };
      }
      return item;
    }));
  };

  const handleDirectQuantityChange = (id, val) => {
    const cleanVal = val.replace(/\D/g, '');

    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;

        if (cleanVal === '') {
          return { ...item, quantityInput: '', quantity: 1 };
        }

        let num = parseInt(cleanVal, 10);
        if (isNaN(num) || num < 1) num = 1;

        if (!isStockIn && num > availableStock) {
          toast.error(`จำกัดสูงสุดเท่าสต็อกคงเหลือ (${availableStock} ${item.unit || 'หน่วย'})`);
          num = availableStock;
        }

        return { ...item, quantityInput: String(num), quantity: num };
      }
      return item;
    }));
  };

  const handleQuantityBlur = (id) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;
        let num = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : parseInt(item.quantityInput, 10);

        if (isNaN(num) || num < 1) num = 1;
        if (!isStockIn && num > availableStock) num = availableStock;

        return { ...item, quantityInput: String(num), quantity: num };
      }
      return item;
    }));
  };

  const handleSubmitCart = () => {
    if (cart.length === 0) return;

    const sanitizedCart = cart.map(item => {
      const availableStock = item.balance !== undefined ? item.balance : Infinity;
      let num = typeof item.quantity === 'number' && !isNaN(item.quantity) && item.quantity >= 1 ? item.quantity : parseInt(item.quantityInput, 10);
      if (isNaN(num) || num < 1) num = 1;
      if (!isStockIn && num > availableStock) num = availableStock;
      return { ...item, quantity: num };
    });

    onSubmit(sanitizedCart, () => {
      setCart([]);
      setIsMobileCartOpen(false);
    });
  };

  const updateItemDetails = (id, field, value) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  };

  const toggleExpand = (id) => {
    setExpandedItemId(prev => prev === id ? null : id);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setStockStatusFilter('all');
  };

  // Metrics
  const totalItemsCount = items.length;
  const inStockItemsCount = items.filter(i => (i.balance || 0) > 0).length;
  const totalCartUnits = cart.reduce((sum, item) => sum + (typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 1), 0);
  const totalCartItemsCount = cart.length;

  const renderCartContent = () => (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Cart Items Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <h3 className="font-extrabold text-sm text-foreground">
            {isStockIn ? 'รายการรับเข้าสต็อก' : 'รายการขอเบิก'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
            {totalCartItemsCount} รายการ ({totalCartUnits} ชิ้น)
          </span>
          {cart.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCart([])}
              className="text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg px-2 h-9"
            >
              ล้างตะกร้า
            </Button>
          )}
        </div>
      </div>

      {/* Cart Items Scrollable Container */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-none max-h-[min(55vh,560px)]">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/60 space-y-2 border border-dashed border-border/60 rounded-2xl bg-muted/20">
            <Package className="w-10 h-10 stroke-1 opacity-40" />
            <p className="text-xs font-semibold text-foreground">ยังไม่มีรายการในตะกร้า</p>
            <p className="text-[11px] text-muted-foreground/80 max-w-[200px]">
              คลิกเลือกรายการวัสดุด้านซ้ายเพื่อเพิ่มในคำขอเบิกจ่าย
            </p>
          </div>
        ) : (
          cart.map(item => {
            const availableStock = item.balance !== undefined ? item.balance : Infinity;
            return (
              <div key={item.id} className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-3 transition-colors hover:border-indigo-500/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm text-foreground line-clamp-2 leading-snug">{item.name}</h4>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {item.unit} {!isStockIn && item.balance !== undefined && `(คงเหลือที่คลังนี้ ${item.balance})`}
                    </p>
                  </div>

                  {/* Quantity Adjustment Controls */}
                  <div className="flex items-center border border-border/60 rounded-lg overflow-hidden bg-background shadow-2xs shrink-0">
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 rounded-none hover:bg-muted text-muted-foreground"
                      onClick={() => updateQuantity(item.id, -1)}
                      disabled={item.quantity <= 1}
                      aria-label={`ลดจำนวน ${item.name}`}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-12 h-10 text-center font-mono text-sm font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground"
                      aria-label={`จำนวน ${item.name}`}
                      value={item.quantityInput !== undefined ? item.quantityInput : String(item.quantity)}
                      onChange={(e) => handleDirectQuantityChange(item.id, e.target.value)}
                      onBlur={() => handleQuantityBlur(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />

                    <Button 
                      type="button"
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 rounded-none hover:bg-muted text-muted-foreground"
                      onClick={() => updateQuantity(item.id, 1)}
                      disabled={!isStockIn && item.quantity >= availableStock}
                      aria-label={`เพิ่มจำนวน ${item.name}`}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                    onClick={() => removeFromCart(item.id)}
                    aria-label={`ลบ ${item.name} ออกจากตะกร้า`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {allowDeliveryDetails && (
                  <div className="pt-1">
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      className="h-10 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg gap-1"
                      onClick={() => toggleExpand(item.id)}
                    >
                      <span>ระบุรายละเอียดจัดส่ง / S/N / Part No.</span>
                      {expandedItemId === item.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>

                    {expandedItemId === item.id && (
                      <div className="mt-2 pl-2 border-l-2 border-indigo-500/30 space-y-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground">สถานที่ส่ง (Delivery To)</label>
                          <select 
                            className="flex h-10 w-full rounded-lg border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={item.delivery_to || ''}
                            onChange={(e) => updateItemDetails(item.id, 'delivery_to', e.target.value)}
                          >
                            <option value="">- เลือกระบุสถานที่ส่ง -</option>
                            <option value="Forth (EMS)">Forth (EMS)</option>
                            <option value="Forth (Office)">Forth (Office)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground">Part Number</label>
                          <Input 
                            className="h-10 text-sm rounded-lg bg-background"
                            placeholder="ระบุ Part Number..." 
                            value={item.part_number || ''}
                            onChange={(e) => updateItemDetails(item.id, 'part_number', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground">Serial Number (คั่นด้วย ,)</label>
                          <textarea 
                            className="flex min-h-[72px] w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="S/N 1, S/N 2, S/N 3..."
                            value={item.serial_number || ''}
                            onChange={(e) => updateItemDetails(item.id, 'serial_number', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Cart Submit Action Button */}
      <div className="border-t border-border/40 pt-3 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">รวมจำนวนที่เลือก</span>
          <span className="font-mono font-extrabold text-foreground">{totalCartUnits.toLocaleString()} ชิ้น</span>
        </div>
        <Button
          type="button"
          className={`w-full h-12 text-sm font-bold rounded-xl shadow-md transition-all gap-2 ${
          isStockIn ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
          disabled={cart.length === 0}
          onClick={handleSubmitCart}
        >
          <Check className="w-4 h-4" />
          {isStockIn ? 'ดำเนินการรับเข้าสต็อก' : 'ไปยังขั้นตอนยืนยันคำขอ'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: Product Catalog Grid & Filter Toolbar */}
      <div className="flex-1 min-w-0 space-y-4 w-full">
        <section className="p-4 sm:p-5 rounded-2xl neu-flat border-0 space-y-4" aria-labelledby="pos-catalog-title">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {Icon && (
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true">
                  <Icon className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <h2 id="pos-catalog-title" className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground">{title}</h2>
                <p className="text-xs text-muted-foreground mt-1">เลือกวัสดุเพื่อเพิ่มลงในตะกร้าคำขอเบิกจ่าย</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground shrink-0">
              <span className="px-2.5 py-1.5 rounded-lg bg-muted/60 font-mono text-[11px]">
                พร้อมเบิก <strong className="text-foreground">{inStockItemsCount}</strong> / {totalItemsCount}
              </span>
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50" aria-label="รูปแบบการแสดงผล">
                <Button
                  type="button"
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className={`h-9 w-9 rounded-md ${viewMode === 'grid' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground'}`}
                  aria-label="แสดงแบบการ์ด"
                  aria-pressed={viewMode === 'grid'}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('table')}
                  className={`h-9 w-9 rounded-md ${viewMode === 'table' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground'}`}
                  aria-label="แสดงแบบตาราง"
                  aria-pressed={viewMode === 'table'}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_190px_190px] gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pos-item-search" className="text-[11px] font-bold text-foreground">ค้นหาวัสดุ</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="pos-item-search"
                  type="search"
                  placeholder="ชื่อรายการ, รุ่น หรือ SKU"
                  className="pl-10 pr-10 h-11 rounded-xl bg-background border-border/60 text-sm shadow-2xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pos-stock-filter" className="text-[11px] font-bold text-foreground">สถานะสต็อก</label>
              <select
                id="pos-stock-filter"
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <option value="all">สต็อกทั้งหมด</option>
                <option value="in_stock">มีสินค้าพร้อมเบิก</option>
                <option value="low_stock">สต็อกใกล้หมด (≤ 5)</option>
                <option value="cross_warehouse">มีในคลังอื่น</option>
                <option value="out_of_stock">ของหมด</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pos-category-filter" className="text-[11px] font-bold text-foreground">หมวดหมู่</label>
              <select
                id="pos-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <option value="all">ทุกหมวดหมู่</option>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs">
            <p className="text-muted-foreground" aria-live="polite">
              แสดง <strong className="text-foreground">{filteredItems.length.toLocaleString()}</strong> รายการจากทั้งหมด {totalItemsCount.toLocaleString()} รายการ
            </p>
            {(search || selectedCategory !== 'all' || stockStatusFilter !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> รีเซ็ตตัวกรอง
              </Button>
            )}
          </div>
        </section>

        {/* Inventory Item Cards Grid or List View */}
        <div className="w-full">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="p-4 rounded-2xl neu-flat-sm border-0 space-y-3 animate-pulse">
                  <div className="aspect-square bg-muted/60 rounded-xl" />
                  <div className="h-3 bg-muted/60 rounded w-2/3" />
                  <div className="h-4 bg-muted/60 rounded w-5/6" />
                  <div className="h-3 bg-muted/60 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground neu-flat rounded-2xl border-0 space-y-2">
              <Package className="w-10 h-10 text-muted-foreground/40 stroke-1" />
              <p className="font-semibold text-sm">ไม่พบรายการวัสดุตรงกับเงื่อนไข</p>
              <p className="text-xs text-muted-foreground">ลองเปลี่ยนคำค้นหา หรือกดรีเซ็ตตัวกรองด้านบนเพื่อแสดงผลใหม่</p>
            </div>
          ) : viewMode === 'table' ? (
            /* List/Table View Density Option */
            <Card className="overflow-hidden neu-flat border-0 rounded-2xl">
              <Table>
                <TableHeader className="bg-muted/50 text-xs">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>ชื่อวัสดุ / รายละเอียด</TableHead>
                    <TableHead>SKU / Model</TableHead>
                    <TableHead className="text-center">สต็อกคงเหลือ</TableHead>
                    <TableHead className="text-right">เพิ่มในคำขอ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {paginatedItems.map((item, idx) => {
                    const { availableStock, totalSystemBalance, hasStockInOtherWarehouse, isLowStock, completelyEmpty } = getStockMeta(item);

                    const cartItem = cart.find(c => c.id === item.id);
                    const isInCart = Boolean(cartItem);

                    return (
                      <TableRow 
                        key={item.id} 
                        className={`transition-colors ${
                          isInCart ? 'bg-indigo-500/5 dark:bg-indigo-950/20' : completelyEmpty ? 'opacity-50' : 'hover:bg-accent/50'
                        }`}
                      >
                        <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                          {startIndex + idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-foreground flex items-center gap-2">
                            <span>{item.name}</span>
                            {isInCart && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white">
                                {cartItem.quantity} ในตะกร้า
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">หน่วย: {item.unit || 'ชิ้น'}</span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          <div>{item.sku || '-'}</div>
                          {item.model && <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">{item.model}</div>}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold font-mono inline-block ${
                            isLowStock 
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' 
                              : availableStock > 0 
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' 
                                : hasStockInOtherWarehouse 
                                  ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300' 
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            {availableStock > 0 ? `${availableStock} ${item.unit || ''}` : hasStockInOtherWarehouse ? `มีคลังอื่น (${totalSystemBalance})` : 'ของหมด'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            disabled={completelyEmpty}
                            onClick={() => addToCart(item)}
                            className={`h-10 px-3 rounded-lg text-xs font-bold gap-1 transition-all ${
                              isInCart 
                                ? 'bg-indigo-600 text-white' 
                                : completelyEmpty
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isInCart ? 'เพิ่มอีก' : 'เบิกวัสดุ'}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            /* Grid View using modular PosItemCard */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {paginatedItems.map(item => (
                <PosItemCard 
                  key={item.id} 
                  item={item} 
                  isStockIn={isStockIn} 
                  cart={cart} 
                  addToCart={addToCart} 
                />
              ))}
            </div>
          )}
        </div>

        {/* Supabase-Style Compact Pagination Footer Bar */}
        {filteredItems.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-muted/40 rounded-2xl neu-pressed-sm border-0 text-xs text-muted-foreground select-none">
            {/* Left Controls: Navigation & Page Input */}
            <div className="flex items-center gap-2">
              {/* Previous Page Button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={currentPage <= 1}
                onClick={() => {
                  const p = Math.max(1, currentPage - 1);
                  setCurrentPage(p);
                  setPageInput(String(p));
                }}
                className="h-8 w-8 rounded-lg border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {/* Page Counter & Editable Numeric Input */}
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={handlePageInputChange}
                  onBlur={handlePageInputBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputBlur(); }}
                  className="h-8 w-12 text-center font-mono text-xs font-bold rounded-lg border border-input bg-background focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all shadow-2xs"
                  aria-label="Current Page Number"
                />
                <span>of</span>
                <span className="font-mono font-bold text-foreground">{totalPages}</span>
              </div>

              {/* Next Page Button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  const p = Math.min(totalPages, currentPage + 1);
                  setCurrentPage(p);
                  setPageInput(String(p));
                }}
                className="h-8 w-8 rounded-lg border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Right Controls: Rows per Page Selector & Total Records Count */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                  }}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs transition-all"
                  aria-label="Rows per page"
                >
                  <option value={24}>24 rows</option>
                  <option value={48}>48 rows</option>
                  <option value={96}>96 rows</option>
                </select>
              </div>

              <span className="font-mono text-xs text-muted-foreground font-semibold">
                {totalRecords.toLocaleString()} records
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Desktop Sticky Order Summary Cart Panel */}
      <Card className="hidden lg:flex w-[340px] xl:w-[380px] max-h-[calc(100vh-2rem)] rounded-2xl neu-flat border-0 p-4 flex-col space-y-4 shrink-0 sticky top-4">
        {renderCartContent()}
      </Card>

      {/* Mobile/Tablet Bottom Cart Floating Action Bar & Modal Drawer */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
          <Button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
            className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xl flex items-center justify-between px-5 gap-2 border border-indigo-400/40 backdrop-blur-md"
            aria-label={`เปิดตะกร้าคำขอเบิกจ่าย ${totalCartItemsCount} รายการ ${totalCartUnits} ชิ้น`}
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/20">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-extrabold uppercase tracking-wide">ตะกร้าคำขอเบิกจ่าย</p>
                <p className="text-[11px] font-mono opacity-90">{totalCartItemsCount} รายการ ({totalCartUnits} ชิ้น)</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-xl">
              ดูรายการคำขอ →
            </span>
          </Button>
        </div>
      )}

      {/* Mobile/Tablet Cart Dialog Sheet */}
      <Dialog open={isMobileCartOpen} onOpenChange={setIsMobileCartOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <span>สรุปรายการขอเบิกจ่าย</span>
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            {renderCartContent()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PosTerminal;
