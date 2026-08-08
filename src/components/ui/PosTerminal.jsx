import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ShoppingCart, Plus, Minus, Trash2, Package, ChevronDown, ChevronUp } from 'lucide-react';

const PosTerminal = ({ 
  title, 
  icon: Icon, 
  items, 
  categories, 
  onSubmit, 
  isLoading, 
  allowDeliveryDetails = false,
  isStockIn = false 
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [expandedItemId, setExpandedItemId] = useState(null);

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));
      const matchCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [items, search, selectedCategory]);

  const addToCart = (item) => {
    const availableStock = item.balance !== undefined ? item.balance : Infinity;
    if (!isStockIn && availableStock <= 0) return;

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        if (!isStockIn && existing.quantity >= availableStock) {
          return prev; // อย่าเพิ่มจำนวนหากเกินสต็อกที่มี (เฉพาะโหมดเบิกออก)
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

        if (!isStockIn && newQ > availableStock) newQ = availableStock;
        if (newQ < 1) newQ = 1;

        return { ...item, quantity: newQ, quantityInput: String(newQ) };
      }
      return item;
    }));
  };

  const handleDirectQuantityChange = (id, val) => {
    // Keep positive digits only
    const cleanVal = val.replace(/\D/g, '');

    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const availableStock = item.balance !== undefined ? item.balance : Infinity;

        if (cleanVal === '') {
          // Allow temporary empty state while typing
          return { ...item, quantityInput: '', quantity: 1 };
        }

        let num = parseInt(cleanVal, 10);
        if (isNaN(num) || num < 1) num = 1;

        if (!isStockIn && num > availableStock) {
          num = availableStock; // Cap at max available stock
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

    // Sanitize cart quantities before submit
    const sanitizedCart = cart.map(item => {
      const availableStock = item.balance !== undefined ? item.balance : Infinity;
      let num = typeof item.quantity === 'number' && !isNaN(item.quantity) && item.quantity >= 1 ? item.quantity : parseInt(item.quantityInput, 10);
      if (isNaN(num) || num < 1) num = 1;
      if (!isStockIn && num > availableStock) num = availableStock;
      return { ...item, quantity: num };
    });

    onSubmit(sanitizedCart, () => setCart([]));
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

  const totalItems = cart.reduce((sum, item) => sum + (typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 1), 0);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6 mt-4">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col h-full overflow-hidden pb-4">
        {/* Header & Filters */}
        <div className="mb-4 space-y-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-6 h-6 text-primary" />}
            <h2 className="text-2xl font-bold">{title}</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="ค้นหาวัสดุ... (ชื่อ, รหัส SKU)" 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              <Button 
                variant={selectedCategory === 'all' ? 'default' : 'outline'} 
                onClick={() => setSelectedCategory('all')}
                className="whitespace-nowrap"
              >
                ทั้งหมด
              </Button>
              {categories.map(cat => (
                <Button 
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'default' : 'outline'} 
                  onClick={() => setSelectedCategory(cat.id)}
                  className="whitespace-nowrap"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-2 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              กำลังโหลด...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Package className="w-12 h-12 mb-2 opacity-20" />
              <p>ไม่พบรายการวัสดุ</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredItems.map(item => {
                const availableStock = item.balance !== undefined ? item.balance : Infinity;
                const isOutOfStock = availableStock <= 0;
                const shouldDisable = !isStockIn && isOutOfStock;
                return (
                  <Card 
                    key={item.id} 
                    className={`cursor-pointer transition-all active:scale-95 group flex flex-col border-none hover:shadow-lg overflow-hidden ${shouldDisable ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => addToCart(item)}
                  >
                    <CardContent className="p-3 flex flex-col h-full justify-between">
                      <div className="aspect-square bg-muted/5 rounded-md flex items-center justify-center p-4 relative mb-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="object-contain w-full h-full group-hover:scale-105 transition-transform" />
                        ) : (
                          <Package className="w-12 h-12 text-muted-foreground/30" />
                        )}
                        {item.balance !== undefined && (
                          <span className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isOutOfStock ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
                            {isStockIn ? `สต็อกปัจจุบัน: ${item.balance}` : (isOutOfStock ? 'ของหมด' : `คงเหลือ ${item.balance} ${item.unit || ''}`)}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground/70 tracking-wider uppercase mb-1 line-clamp-1">{item.sku || 'No SKU'}</p>
                        <h3 className="font-bold text-sm line-clamp-2 leading-tight text-foreground">{item.name}</h3>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <Card className="w-full lg:w-[350px] xl:w-[400px] flex flex-col h-full shrink-0 border-none">
        <CardHeader className="pb-4 border-b border-border/40 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            {isStockIn ? 'รายการรับเข้าสต็อก' : 'รายการขอเบิก'}
          </CardTitle>
          <span className="text-sm font-bold text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-md">
            {totalItems} ชิ้น
          </span>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto py-4 px-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
              <Package className="w-12 h-12 mb-4 stroke-1" />
              <p className="text-sm font-medium">ยังไม่มีรายการ</p>
              <p className="text-xs mt-1">เลือกวัสดุจากแคตตาล็อกด้านซ้าย</p>
            </div>
          ) : (
            <div className="space-y-6">
              {cart.map(item => {
                const availableStock = item.balance !== undefined ? item.balance : Infinity;
                return (
                  <div key={item.id} className="flex flex-col group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted/20 rounded flex items-center justify-center shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-8 h-8 object-contain" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground/50 stroke-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.unit} {!isStockIn && item.balance !== undefined && `(คงเหลือ ${item.balance})`}
                        </p>
                      </div>
                      
                      {/* Direct Numeric Input Quantity Control */}
                      <div className="flex items-center border rounded-md overflow-hidden bg-background shadow-sm">
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-none hover:bg-muted shrink-0 text-muted-foreground" 
                          onClick={() => updateQuantity(item.id, -1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-12 h-7 text-center text-xs font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground"
                          value={item.quantityInput !== undefined ? item.quantityInput : String(item.quantity)}
                          onChange={(e) => handleDirectQuantityChange(item.id, e.target.value)}
                          onBlur={() => handleQuantityBlur(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                        />

                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-none hover:bg-muted shrink-0 text-muted-foreground" 
                          onClick={() => updateQuantity(item.id, 1)}
                          disabled={!isStockIn && item.quantity >= availableStock}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {allowDeliveryDetails && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={() => toggleExpand(item.id)}>
                          {expandedItemId === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-red-500 transition-all ml-1" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {allowDeliveryDetails && expandedItemId === item.id && (
                      <div className="ml-14 mt-3 pl-4 border-l border-border/50 space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">สถานที่ส่ง (Delivery To)</label>
                          <select 
                            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.delivery_to || ''}
                            onChange={(e) => updateItemDetails(item.id, 'delivery_to', e.target.value)}
                          >
                            <option value="">- เลือกระบุสถานที่ส่ง -</option>
                            <option value="Forth (EMS)">Forth (EMS)</option>
                            <option value="Forth (Office)">Forth (Office)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Part Number</label>
                          <Input 
                            className="h-8 text-sm" 
                            placeholder="ระบุ Part Number..." 
                            value={item.part_number || ''}
                            onChange={(e) => updateItemDetails(item.id, 'part_number', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Serial Number (คั่นด้วย ,)</label>
                          <textarea 
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                            placeholder="S/N 1, S/N 2, S/N 3..."
                            value={item.serial_number || ''}
                            onChange={(e) => updateItemDetails(item.id, 'serial_number', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        
        <div className="p-4 border-t border-border/40 mt-auto bg-muted/5 rounded-b-xl">
          <Button 
            className={`w-full h-12 text-sm font-bold rounded-lg shadow-md ${isStockIn ? 'bg-green-600 hover:bg-green-700' : ''}`}
            disabled={cart.length === 0}
            onClick={handleSubmitCart}
          >
            {isStockIn ? 'ดำเนินการรับเข้าสต็อก' : 'ยืนยันรายการเบิกจ่าย'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PosTerminal;
