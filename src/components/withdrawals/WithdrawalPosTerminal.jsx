import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Search, ShoppingCart, Plus, Minus, Package, 
  ChevronLeft, ChevronRight, RotateCcw, Tag,
  LayoutGrid, List, Building2, X, Sparkles, Filter, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import WithdrawalItemCard from './WithdrawalItemCard';
import StockLocationBreakdownModal from './StockLocationBreakdownModal';
import WithdrawalCartPanel from './WithdrawalCartPanel';

const WithdrawalPosTerminal = ({
  items = [],
  rawItems = [],
  rawBalances = [],
  categories = [],
  projects = [],
  selectedProjectId,
  onSelectProject,
  cart = [],
  onAddToCart,
  onUpdateQuantity,
  onDirectQuantityChange,
  onQuantityBlur,
  onRemoveFromCart,
  onClearCart,
  onUpdateItemDetails,
  onSubmitOrder,
  isLoading = false,
  isSubmitting = false
}) => {
  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'cross_warehouse' | 'out_of_stock'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Mobile cart sheet state
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Cross-warehouse modal state
  const [breakdownModalItem, setBreakdownModalItem] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const [pageInput, setPageInput] = useState('1');

  const searchInputRef = useRef(null);

  // Global keyboard shortcut: Press '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.model && item.model.toLowerCase().includes(q));

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

  // Reset page when filters change
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

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setStockStatusFilter('all');
  };

  // Grouped project list for selector
  const groupedProjects = useMemo(() => {
    const map = new Map();
    projects.forEach(p => {
      const key = `${(p.name || '').trim()}|||${(p.project_code || '').trim()}`;
      if (!map.has(key)) map.set(key, { key, name: p.name, project_code: p.project_code, locations: [p] });
      else map.get(key).locations.push(p);
    });
    return Array.from(map.values());
  }, [projects]);

  const totalCartUnits = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const inStockCount = items.filter(i => (i.balance || 0) > 0).length;

  return (
    <div className="flex flex-col lg:flex-row items-start gap-6 animate-in fade-in-50 duration-200">
      {/* Left: Product Catalog & Controls */}
      <div className="flex-1 min-w-0 space-y-4 w-full">
        {/* Context Header: Target Project Selector */}
        <div className="p-4 rounded-3xl glass border border-border/60 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm text-foreground">โครงการเป้าหมาย (Target Project)</h3>
                <span className="text-destructive font-bold text-xs">*</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                เลือกโครงการเพื่อตรวจสอบและตัดสต็อกตามสถานที่จัดเก็บจริง
              </p>
            </div>
          </div>

          <div className="w-full sm:w-80">
            <select
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shadow-2xs transition-all cursor-pointer"
            >
              <option value="all">-- ทุกสถานที่จัดเก็บ (แสดงยอดรวมทั้งระบบ) --</option>
              {groupedProjects.map(group => (
                <optgroup key={group.key} label={`${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}>
                  {group.locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location || 'คลังหลัก'} {loc.description ? `(${loc.description})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Search, Filter Toolbar & Density Controls */}
        <div className="p-4 rounded-3xl glass border border-border/60 shadow-2xs space-y-3.5">
          {/* Top Search Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="ค้นหาวัสดุ... (ชื่อรายการ, รหัส SKU, รุ่น Model) กด / เพื่อค้นหาทันที"
                className="pl-9 pr-8 h-11 rounded-2xl bg-background border-border/60 focus:ring-2 focus:ring-indigo-500 text-xs shadow-2xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-accent cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Density View Mode Selector */}
            <div className="flex items-center gap-1 bg-muted/60 dark:bg-muted/30 p-1 rounded-2xl border border-border/50 shrink-0">
              <Button
                type="button"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setViewMode('grid')}
                className={`h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-background text-foreground shadow-xs border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="มุมมองแบบการ์ด (Grid View)"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>การ์ด</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setViewMode('table')}
                className={`h-9 px-3 rounded-xl text-xs font-semibold gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-xs border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="มุมมองแบบตาราง (List/Table View)"
              >
                <List className="w-4 h-4" />
                <span>ตาราง</span>
              </Button>
            </div>
          </div>

          {/* Stock Availability Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[11px] font-bold text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> สถานะสต็อก:
            </span>

            <Button
              type="button"
              variant={stockStatusFilter === 'all' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setStockStatusFilter('all')}
              className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                stockStatusFilter === 'all'
                  ? 'bg-slate-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900'
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              }`}
            >
              ทั้งหมด ({items.length})
            </Button>

            <Button
              type="button"
              variant={stockStatusFilter === 'in_stock' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setStockStatusFilter('in_stock')}
              className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                stockStatusFilter === 'in_stock'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10'
              }`}
            >
              พร้อมเบิก ({inStockCount})
            </Button>

            <Button
              type="button"
              variant={stockStatusFilter === 'low_stock' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setStockStatusFilter('low_stock')}
              className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                stockStatusFilter === 'low_stock'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              สต็อกใกล้หมด (≤ 5)
            </Button>

            <Button
              type="button"
              variant={stockStatusFilter === 'cross_warehouse' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setStockStatusFilter('cross_warehouse')}
              className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                stockStatusFilter === 'cross_warehouse'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10'
              }`}
            >
              มีในคลังอื่น
            </Button>

            <Button
              type="button"
              variant={stockStatusFilter === 'out_of_stock' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setStockStatusFilter('out_of_stock')}
              className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                stockStatusFilter === 'out_of_stock'
                  ? 'bg-slate-600 text-white shadow-2xs'
                  : 'border-slate-300 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
              }`}
            >
              ของหมด
            </Button>
          </div>

          {/* Category Filter Horizontal Scroll */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-[11px] font-bold text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
                <Tag className="w-3 h-3" /> หมวดหมู่:
              </span>
              <Button
                type="button"
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="xs"
                onClick={() => setSelectedCategory('all')}
                className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                    : 'border-border/60 hover:bg-accent text-muted-foreground'
                }`}
              >
                ทั้งหมด
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat.id}
                  type="button"
                  variant={selectedCategory === cat.id ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`h-7 px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                      : 'border-border/60 hover:bg-accent text-muted-foreground'
                  }`}
                >
                  {cat.name}
                </Button>
              ))}
            </div>

            {(search || selectedCategory !== 'all' || stockStatusFilter !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleResetFilters}
                className="h-7 px-2 text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl shrink-0 gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> รีเซ็ต
              </Button>
            )}
          </div>
        </div>

        {/* Product Catalog Display (Grid or Dense Table) */}
        <div className="w-full">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="p-4 rounded-3xl glass border border-border/40 space-y-3 animate-pulse">
                  <div className="aspect-square bg-muted/60 rounded-2xl" />
                  <div className="h-3 bg-muted/60 rounded w-2/3" />
                  <div className="h-4 bg-muted/60 rounded w-5/6" />
                  <div className="h-3 bg-muted/60 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground glass rounded-3xl border border-border/60 space-y-2">
              <Package className="w-12 h-12 text-muted-foreground/30 stroke-1" />
              <p className="font-bold text-sm text-foreground">ไม่พบรายการวัสดุที่ตรงกับเงื่อนไข</p>
              <p className="text-xs text-muted-foreground max-w-sm text-center">
                ลองพิมพ์คำค้นหาใหม่ หรือกดปุ่มรีเซ็ตตัวกรองด้านบนเพื่อแสดงสินค้าทั้งหมด
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="rounded-xl text-xs mt-2"
              >
                รีเซ็ตตัวกรองทั้งหมด
              </Button>
            </div>
          ) : viewMode === 'table' ? (
            /* List/Table View */
            <Card className="overflow-hidden glass border border-border/60 rounded-3xl shadow-sm">
              <Table>
                <TableHeader className="bg-muted/50 text-xs">
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>ชื่อวัสดุ / รายละเอียด</TableHead>
                    <TableHead>SKU / Model</TableHead>
                    <TableHead className="text-center">สต็อกคงเหลือ</TableHead>
                    <TableHead className="text-right">เพิ่มในคำขอ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {paginatedItems.map((item, idx) => {
                    const availableStock = item.balance !== undefined ? item.balance : Infinity;
                    const totalSys = item.totalSystemBalance !== undefined ? item.totalSystemBalance : availableStock;
                    const isOutOfStock = availableStock <= 0;
                    const hasStockInOtherWarehouse = isOutOfStock && totalSys > 0;
                    const isLowStock = availableStock > 0 && availableStock <= 5;
                    const completelyEmpty = isOutOfStock && totalSys <= 0;

                    const cartItem = cart.find(c => c.id === item.id);
                    const isInCart = Boolean(cartItem);

                    return (
                      <TableRow
                        key={item.id}
                        className={`transition-colors ${
                          isInCart
                            ? 'bg-indigo-500/5 dark:bg-indigo-950/20'
                            : completelyEmpty
                              ? 'opacity-50'
                              : 'hover:bg-accent/50'
                        }`}
                      >
                        <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                          {startIndex + idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-foreground flex items-center gap-2">
                            <span>{item.name}</span>
                            {isInCart && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-600 text-white shadow-2xs">
                                {cartItem.quantity} ในคำขอ
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">หน่วย: {item.unit || 'ชิ้น'}</span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          <div>{item.sku || '-'}</div>
                          {item.model && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">{item.model}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (hasStockInOtherWarehouse || totalSys > 0) {
                                setBreakdownModalItem(item);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold font-mono inline-flex items-center gap-1 cursor-pointer transition-all ${
                              isLowStock
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                : availableStock > 0
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : hasStockInOtherWarehouse
                                    ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 animate-pulse'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {availableStock > 0
                              ? `${availableStock} ${item.unit || ''}`
                              : hasStockInOtherWarehouse
                                ? `มีคลังอื่น (${totalSys})`
                                : 'ของหมด'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {isInCart ? (
                            <div className="inline-flex items-center border border-border/60 rounded-xl overflow-hidden bg-background shadow-2xs">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none hover:bg-muted text-muted-foreground"
                                onClick={() => onUpdateQuantity(item.id, -1)}
                                disabled={cartItem.quantity <= 1}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="font-mono text-xs font-bold text-foreground px-2">
                                {cartItem.quantity}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none hover:bg-muted text-muted-foreground"
                                onClick={() => onUpdateQuantity(item.id, 1)}
                                disabled={cartItem.quantity >= availableStock}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              disabled={completelyEmpty}
                              onClick={() => {
                                if (isOutOfStock && hasStockInOtherWarehouse) {
                                  setBreakdownModalItem(item);
                                } else {
                                  onAddToCart(item);
                                }
                              }}
                              className={`h-8 px-3 rounded-xl text-xs font-bold gap-1 transition-all cursor-pointer ${
                                isOutOfStock && hasStockInOtherWarehouse
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : completelyEmpty
                                    ? 'bg-muted text-muted-foreground'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{isOutOfStock && hasStockInOtherWarehouse ? 'ดูคลังอื่น' : 'เพิ่มในคำขอ'}</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3.5">
              {paginatedItems.map(item => (
                <WithdrawalItemCard
                  key={item.id}
                  item={item}
                  cartItem={cart.find(c => c.id === item.id)}
                  onAddToCart={onAddToCart}
                  onUpdateQuantity={onUpdateQuantity}
                  onOpenLocationBreakdown={(it) => setBreakdownModalItem(it)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Compact Pagination Controls */}
        {filteredItems.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-muted/40 rounded-3xl border border-border/60 glass shadow-2xs text-xs text-muted-foreground select-none">
            <div className="flex items-center gap-2">
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
                className="h-8 w-8 rounded-xl border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span>หน้า</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={handlePageInputChange}
                  onBlur={handlePageInputBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputBlur(); }}
                  className="h-8 w-12 text-center font-mono text-xs font-bold rounded-xl border border-input bg-background focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all shadow-2xs"
                />
                <span>จาก</span>
                <span className="font-mono font-bold text-foreground">{totalPages}</span>
              </div>

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
                className="h-8 w-8 rounded-xl border-border/80 text-foreground hover:bg-accent disabled:opacity-30 transition-all cursor-pointer shadow-2xs"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="h-8 rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs transition-all"
              >
                <option value={24}>24 รายการ/หน้า</option>
                <option value={48}>48 รายการ/หน้า</option>
                <option value={96}>96 รายการ/หน้า</option>
              </select>

              <span className="font-mono text-xs text-muted-foreground font-semibold">
                รวม {totalRecords.toLocaleString()} รายการ
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Desktop Sticky Order Summary Cart Panel */}
      <Card className="hidden lg:flex w-[380px] xl:w-[420px] rounded-3xl glass border border-border/70 shadow-lg p-5 flex-col space-y-4 shrink-0 sticky top-4">
        <WithdrawalCartPanel
          cart={cart}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onUpdateQuantity={onUpdateQuantity}
          onDirectQuantityChange={onDirectQuantityChange}
          onQuantityBlur={onQuantityBlur}
          onRemoveFromCart={onRemoveFromCart}
          onClearCart={onClearCart}
          onUpdateItemDetails={onUpdateItemDetails}
          onSubmitOrder={onSubmitOrder}
          isSubmitting={isSubmitting}
        />
      </Card>

      {/* Mobile/Tablet Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
          <Button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
            className="w-full h-14 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-2xl flex items-center justify-between px-5 gap-2 border border-indigo-400/40 backdrop-blur-md cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-extrabold uppercase tracking-wide">ตะกร้าคำขอเบิกจ่าย</p>
                <p className="text-[11px] font-mono opacity-90">{cart.length} รายการ ({totalCartUnits} ชิ้น)</p>
              </div>
            </div>
            <span className="text-xs font-extrabold bg-white/20 px-3.5 py-1.5 rounded-2xl">
              ดูตะกร้า & ส่งคำขอ →
            </span>
          </Button>
        </div>
      )}

      {/* Mobile/Tablet Cart Dialog Sheet */}
      <Dialog open={isMobileCartOpen} onOpenChange={setIsMobileCartOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto rounded-3xl glass p-5">
          <WithdrawalCartPanel
            cart={cart}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
            onUpdateQuantity={onUpdateQuantity}
            onDirectQuantityChange={onDirectQuantityChange}
            onQuantityBlur={onQuantityBlur}
            onRemoveFromCart={onRemoveFromCart}
            onClearCart={onClearCart}
            onUpdateItemDetails={onUpdateItemDetails}
            onSubmitOrder={(orderParams) => {
              setIsMobileCartOpen(false);
              onSubmitOrder(orderParams);
            }}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Cross-Warehouse Stock Inspector Modal */}
      <StockLocationBreakdownModal
        isOpen={Boolean(breakdownModalItem)}
        onClose={() => setBreakdownModalItem(null)}
        item={breakdownModalItem}
        rawBalances={rawBalances}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(projId) => {
          onSelectProject(projId);
          setBreakdownModalItem(null);
          toast.success('เปลี่ยนโครงการเป้าหมายเรียบร้อยแล้ว');
        }}
      />
    </div>
  );
};

export default WithdrawalPosTerminal;
