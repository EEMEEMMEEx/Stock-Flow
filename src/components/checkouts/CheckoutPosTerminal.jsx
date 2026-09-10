import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Package, Search, Building2, User, 
  Calendar, Layers, Plus, Minus, Trash2, CheckCircle2, 
  Send, Tag, Hash, 
  ClipboardPaste, Barcode, Infinity as InfinityIcon, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ProjectLocationSelector } from '@/components/common/ProjectLocationSelector';

const CheckoutPosTerminal = ({
  projects = [],
  items = [],
  rawBalances = [],
  onCheckoutSuccess
}) => {
  const { profile, user, isAdmin, isSuperAdmin } = useAuth();
  const canChooseBorrower = isAdmin || isSuperAdmin;
  
  // Selected source project
  const [selectedProjectId, setSelectedProjectId] = useState('');
  
  // Borrower Info Form
  const [borrowerType, setBorrowerType] = useState('profile');
  const [borrowerId, setBorrowerId] = useState('');
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerDepartment, setBorrowerDepartment] = useState('');
  const [borrowerOptions, setBorrowerOptions] = useState([]);
  const [loadingBorrowers, setLoadingBorrowers] = useState(false);
  
  // Today + 7 days default expected return date
  const defaultDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);
  const [borrowType, setBorrowType] = useState('standard'); // 'standard' | 'indefinite'
  const [expectedReturnDate, setExpectedReturnDate] = useState(defaultDueDate);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  // Cart for items being checked out
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Active batch paste input states per item: { [itemId]: string }
  const [batchInputText, setBatchInputText] = useState({});
  const [showBatchInput, setShowBatchInput] = useState({});

  // Keep the default borrower tied to the authenticated profile.
  useEffect(() => {
    if (!profile?.id) return;

    setBorrowerType('profile');
    setBorrowerId(profile.id);
    setBorrowerName(profile.full_name?.trim() || user?.email?.split('@')[0] || 'User');
    setBorrowerPhone(profile.phone || '');
    setBorrowerDepartment(profile.department || '');
  }, [profile?.id, profile?.full_name, profile?.phone, profile?.department, user?.email]);

  // ADMIN/SUPER may select an active profile when checking out on behalf of another user.
  useEffect(() => {
    let isMounted = true;

    if (!canChooseBorrower) {
      setBorrowerOptions([]);
      return undefined;
    }

    const loadBorrowers = async () => {
      setLoadingBorrowers(true);
      const { data, error } = await supabase.rpc('get_checkout_borrowers');

      if (!isMounted) return;

      if (error) {
        console.error('Error loading checkout borrowers:', error);
        toast.error('Failed to load active users for checkout');
        setBorrowerOptions([]);
      } else {
        setBorrowerOptions(data || []);
      }
      setLoadingBorrowers(false);
    };

    loadBorrowers();
    return () => {
      isMounted = false;
    };
  }, [canChooseBorrower]);

  const handleBorrowerChange = (selectedId) => {
    if (selectedId === '__external__') {
      setBorrowerType('external');
      setBorrowerId('');
      setBorrowerName('');
      setBorrowerPhone('');
      setBorrowerDepartment('');
      return;
    }

    const selectedBorrower = borrowerOptions.find((borrower) => borrower.id === selectedId);
    if (!selectedBorrower) return;

    setBorrowerType('profile');
    setBorrowerId(selectedBorrower.id);
    setBorrowerName(selectedBorrower.full_name || '');
    setBorrowerPhone(selectedBorrower.phone || '');
    setBorrowerDepartment(selectedBorrower.department || '');
  };



  // Available items in the selected project location
  const availableItems = useMemo(() => {
    if (!selectedProjectId) return [];
    
    return items.map(item => {
      const b = (rawBalances || []).find(
        r => r.project_id === selectedProjectId && r.item_id === item.id
      );
      const balance = b ? (Number(b.balance) || 0) : 0;
      return {
        ...item,
        availableStock: balance
      };
    }).filter(i => i.availableStock > 0);
  }, [items, rawBalances, selectedProjectId]);

  // Filter available items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems.slice(0, 16);
    const q = searchQuery.toLowerCase();
    return availableItems.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [availableItems, searchQuery]);

  // Add item to cart
  const handleAddToCart = (item) => {
    const existing = cart.find(c => c.item_id === item.id);
    if (existing) {
      if (existing.quantity >= item.availableStock) {
        toast.error(`Cannot checkout more than available stock (${item.availableStock} ${item.unit || 'ชิ้น'})`);
        return;
      }
      handleUpdateQuantity(item.id, existing.quantity + 1);
    } else {
      setCart(prev => [
        ...prev,
        {
          item_id: item.id,
          item_name: item.name,
          sku: item.sku,
          model: item.model,
          unit: item.unit || 'ชิ้น',
          quantity: 1,
          availableStock: item.availableStock,
          serial_numbers: [''], // Array with length matching quantity
          condition: 'normal',
          notes: ''
        }
      ]);
    }
  };

  // Update item quantity and sync serial_numbers array length
  const handleUpdateQuantity = (itemId, newQty) => {
    const parsedQty = Math.max(1, parseInt(newQty) || 1);
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      const cappedQty = Math.min(parsedQty, item.availableStock);
      const existingSNs = Array.isArray(item.serial_numbers) 
        ? item.serial_numbers 
        : (item.serial_number ? [item.serial_number] : ['']);
      
      const newSNs = Array.from({ length: cappedQty }, (_, idx) => existingSNs[idx] || '');
      
      return {
        ...item,
        quantity: cappedQty,
        serial_numbers: newSNs
      };
    }));
  };

  // Update a single serial number slot
  const handleUpdateItemSN = (itemId, index, value) => {
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      const sns = [...(item.serial_numbers || [])];
      sns[index] = value;
      return { ...item, serial_numbers: sns };
    }));
  };

  // Quick Batch Paste / Scan Multi-SN helper
  const handleApplyBatchSN = (itemId) => {
    const rawText = batchInputText[itemId] || '';
    if (!rawText.trim()) return;

    const parts = rawText
      .split(/[\r\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      // Auto expand quantity if pasted SNs count exceeds current quantity
      const targetQty = Math.min(Math.max(item.quantity, parts.length), item.availableStock);
      const newSNs = Array.from({ length: targetQty }, (_, idx) => parts[idx] || (item.serial_numbers && item.serial_numbers[idx]) || '');

      return {
        ...item,
        quantity: targetQty,
        serial_numbers: newSNs
      };
    }));

    toast.success(`Imported ${parts.length} Serial Number${parts.length === 1 ? '' : 's'}`);
    setBatchInputText(prev => ({ ...prev, [itemId]: '' }));
    setShowBatchInput(prev => ({ ...prev, [itemId]: false }));
  };

  // Clear all Serial Numbers for an item
  const handleClearItemSNs = (itemId) => {
    setCart(prev => prev.map(item => {
      if (item.item_id !== itemId) return item;
      return {
        ...item,
        serial_numbers: Array.from({ length: item.quantity }, () => '')
      };
    }));
    toast.success('Serial numbers cleared successfully');
  };

  const handleRemoveFromCart = (itemId) => {
    setCart(prev => prev.filter(c => c.item_id !== itemId));
  };

  const totalUnits = cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  // Submit checkout order
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) {
      return toast.error('Please select source project/location');
    }
    if (borrowerType === 'profile' && !borrowerId) {
      return toast.error('Unable to resolve the checkout user. Please refresh and try again.');
    }
    if (borrowerType === 'external' && !canChooseBorrower) {
      return toast.error('Only ADMIN/SUPER can checkout for a person outside the system.');
    }
    if (!borrowerName.trim()) {
      return toast.error('Please specify borrower name');
    }
    if (borrowType === 'standard' && !expectedReturnDate) {
      return toast.error('Please specify return due date for standard loans');
    }
    if (cart.length === 0) {
      return toast.error('Please select at least one item to checkout');
    }

    // Verify stock availability
    for (const item of cart) {
      if (Number(item.quantity) <= 0) {
        return toast.error(`Checkout quantity for "${item.item_name}" must be greater than 0`);
      }
      if (Number(item.quantity) > item.availableStock) {
        return toast.error(`Checkout quantity for "${item.item_name}" exceeds available stock (${item.availableStock})`);
      }
    }

    try {
      setSubmitting(true);

      // Expand items with multi-SN into distinct line items, or single row if no SNs
      const expandedItems = [];
      for (const item of cart) {
        const sns = (item.serial_numbers || []).map(s => s.trim());
        const hasAnySN = sns.some(Boolean);
        const qty = Number(item.quantity);

        if (hasAnySN) {
          // If individual SNs are specified, create 1 line item per unit for serialized custody & audit
          for (let i = 0; i < qty; i++) {
            expandedItems.push({
              item_id: item.item_id,
              quantity: 1,
              serial_number: sns[i] || null,
              condition: item.condition || 'normal',
              notes: item.notes?.trim() || null
            });
          }
        } else {
          // Bulk consumable / non-serialized items
          expandedItems.push({
            item_id: item.item_id,
            quantity: qty,
            serial_number: null,
            condition: item.condition || 'normal',
            notes: item.notes?.trim() || null
          });
        }
      }

      const payload = {
        project_id: selectedProjectId,
        borrower_type: borrowerType,
        borrower_id: borrowerType === 'profile' ? borrowerId : null,
        borrower_name: borrowerName.trim(),
        borrower_phone: borrowerPhone.trim() || null,
        borrower_department: borrowerDepartment.trim() || null,
        borrow_type: borrowType,
        expected_return_date: borrowType === 'standard' ? expectedReturnDate : null,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
        items: expandedItems
      };

      const { data, error } = await supabase.rpc('process_checkout_order', {
        p_payload: payload
      });

      if (error) throw error;

      toast.success(`Checkout order ${data.order_number || ''} created successfully`);
      setCart([]);
      setBorrowType('standard');
      setExpectedReturnDate(defaultDueDate);
      setBorrowerType('profile');
      setBorrowerId(profile?.id || '');
      setBorrowerName(profile?.full_name?.trim() || user?.email?.split('@')[0] || 'User');
      setBorrowerPhone(profile?.phone || '');
      setBorrowerDepartment(profile?.department || '');
      setPurpose('');
      setNotes('');
      setBatchInputText({});
      setShowBatchInput({});
      if (onCheckoutSuccess) onCheckoutSuccess(data);
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err.message || 'Failed to create checkout order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleCheckoutSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Project Location & Item Selection (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Step 1: Project & Location Picker */}
          <Card className="rounded-xl bg-card border border-border shadow-xs">
            <CardHeader className="border-b border-border/40 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <span>1. Source Project & Storage Location</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <ProjectLocationSelector
                projects={projects}
                value={selectedProjectId}
                onChange={(id) => {
                  setSelectedProjectId(id);
                  setCart([]); // Clear cart when project changes
                }}
                required={true}
                mode="dual"
                label="Source Project & Storage Location"
                showSummaryCard={false}
              />

              {selectedProjectId && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-indigo-500/5 dark:bg-indigo-950/20 p-2.5 rounded-lg border border-indigo-500/20">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Available items in this warehouse:</span>
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {availableItems.length} {availableItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Item Catalog Search & Add */}
          <Card className="rounded-xl bg-card border border-border shadow-xs">
            <CardHeader className="border-b border-border/40 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Package className="w-4 h-4" />
                </div>
                <span>2. Select Items to Checkout</span>
              </CardTitle>

              {/* Search Bar */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, SKU, model..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={!selectedProjectId}
                  className="pl-8 h-9 text-xs rounded-lg"
                />
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {!selectedProjectId ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1 bg-muted/20 rounded-xl border border-dashed border-border/60">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
                  <p className="font-semibold text-foreground">Please select source project/location first</p>
                  <p className="text-[11px]">To load available items in stock for checkout</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1 bg-muted/20 rounded-xl border border-dashed border-border/60">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-1" />
                  <p className="font-semibold text-foreground">No items found in this warehouse</p>
                  <p className="text-[11px]">or available stock in this warehouse is 0</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {filteredItems.map(item => {
                    const cartItem = cart.find(c => c.item_id === item.id);
                    const isAdded = Boolean(cartItem);

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleAddToCart(item)}
                        className={`p-3 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between select-none ${
                          isAdded 
                            ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30' 
                            : 'bg-card hover:bg-accent/40 border-border/70 hover:border-indigo-500/30'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-bold text-xs text-foreground line-clamp-2 leading-tight">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            {item.sku && <span>SKU: {item.sku}</span>}
                            {item.model && <span>• {item.model}</span>}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Available: {item.availableStock} {item.unit || 'ชิ้น'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 ${
                            isAdded 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-muted text-muted-foreground hover:bg-indigo-500 hover:text-white'
                          }`}>
                            <Plus className="w-3 h-3" />
                            {isAdded ? `Added (${cartItem.quantity})` : 'Add'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checkout Details & Cart (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Step 3: Borrower & Due Date Form */}
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-xs">
            <div className="flex flex-col space-y-1.5 p-6 border-b border-border/40 pb-3">
              <h3 className="tracking-tight text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <User className="w-4 h-4" />
                </div>
                <span>3. Borrower Information & Due Date</span>
              </h3>
            </div>
            <div className="p-6 pt-4 space-y-3">

              {canChooseBorrower && (
                <div className="space-y-1">
                  <Label htmlFor="checkout_borrower" className="text-xs font-semibold text-foreground">
                    Checkout On Behalf Of
                  </Label>
                  <select
                    id="checkout_borrower"
                    value={borrowerType === 'external' ? '__external__' : borrowerId}
                    onChange={(e) => handleBorrowerChange(e.target.value)}
                    disabled={loadingBorrowers || borrowerOptions.length === 0}
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {borrowerOptions.length === 0 ? (
                      <option value="">No active users available</option>
                    ) : (
                      borrowerOptions.map((borrower) => (
                        <option key={borrower.id} value={borrower.id}>
                          {borrower.full_name || 'Unnamed user'}{borrower.phone ? ' — ' + borrower.phone : ''}
                        </option>
                      ))
                    )}
                    <option value="__external__">Other — person not in system</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    ADMIN/SUPER can create a checkout for another active user.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">Borrower Name / Technician <span className="text-destructive">*</span></Label>
                  <Input
                    required
                    placeholder="e.g. John Doe"
                    value={borrowerName}
                    readOnly={borrowerType === 'profile'}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    className="h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">Phone Number</Label>
                  <Input
                    placeholder="e.g. 081-234-5678"
                    value={borrowerPhone}
                    readOnly={borrowerType === 'profile'}
                    onChange={(e) => setBorrowerPhone(e.target.value)}
                    className="h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>
              </div>

              {/* Borrow Type Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Loan Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBorrowType('standard')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      borrowType === 'standard'
                        ? 'bg-indigo-500/10 border-indigo-600 dark:border-indigo-400 ring-1 ring-indigo-500/30 text-foreground'
                        : 'bg-muted/30 hover:bg-muted/60 border-border/70 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                      <Clock className={`w-3.5 h-3.5 ${borrowType === 'standard' ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`} />
                      <span>Standard Loan</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Standard Loan (with due date)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBorrowType('indefinite')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      borrowType === 'indefinite'
                        ? 'bg-purple-500/15 border-purple-600 dark:border-purple-400 ring-1 ring-purple-500/40 text-foreground'
                        : 'bg-muted/30 hover:bg-muted/60 border-border/70 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-purple-700 dark:text-purple-300">
                      <InfinityIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Indefinite Loan</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Indefinite Loan (long-term use)
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">Department / Team</Label>
                  <Input
                    placeholder="e.g. Installation Team"
                    value={borrowerDepartment}
                    onChange={(e) => setBorrowerDepartment(e.target.value)}
                    className="h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>

                {borrowType === 'standard' ? (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1 text-red-600 dark:text-red-400">
                      <Calendar className="w-3 h-3" />
                      <span>Expected Return Date <span className="text-destructive">*</span></span>
                    </Label>
                    <Input
                      type="date"
                      required
                      value={expectedReturnDate}
                      onChange={(e) => setExpectedReturnDate(e.target.value)}
                      className="h-9 text-xs rounded-lg font-semibold bg-background border border-input"
                    />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-purple-500/10 dark:bg-purple-950/30 border border-purple-500/30 flex items-start gap-2">
                    <InfinityIcon className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-purple-400" />
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                        No Return Date
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        No due date, not counted as overdue, can be returned anytime.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Purpose of Borrowing / Job Reference</Label>
                <Input
                  placeholder="e.g. Site maintenance"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="h-9 text-xs rounded-lg bg-background border border-input"
                />
              </div>
            </div>
          </div>

          {/* Step 4: Checkout Cart & Multi-SN Batch Inputs */}
          <Card className="rounded-xl bg-card border border-border shadow-xs">
            <CardHeader className="border-b border-border/40 pb-3 flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Layers className="w-4 h-4" />
                </div>
                <span>4. Checkout Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'} / {totalUnits} {totalUnits === 1 ? 'unit' : 'units'})</span>
              </CardTitle>

              {cart.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCart([]);
                    setBatchInputText({});
                    setShowBatchInput({});
                  }}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  Clear Cart
                </Button>
              )}
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs bg-muted/15 rounded-xl border border-dashed border-border/60">
                  No items selected yet
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {cart.map((item) => {
                    const sns = item.serial_numbers || [''];
                    const filledSNCount = sns.filter(s => s && s.trim()).length;
                    const isMulti = item.quantity > 1;
                    const isBatchOpen = showBatchInput[item.item_id];

                    return (
                      <div key={item.item_id} className="p-3.5 rounded-xl bg-card border border-border shadow-xs space-y-3">
                        {/* Item Header & Delete */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-foreground line-clamp-1">{item.item_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                              {item.sku && <span>SKU: {item.sku}</span>}
                              <span>• In Stock: {item.availableStock} {item.unit || 'ชิ้น'}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFromCart(item.item_id)}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg shrink-0 cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between gap-2 bg-muted/30 p-2 rounded-lg border border-border/40">
                          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Checkout Quantity ({item.unit || 'ชิ้น'}):</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={item.quantity <= 1}
                              onClick={() => handleUpdateQuantity(item.item_id, item.quantity - 1)}
                              className="h-7 w-7 rounded-lg text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>

                            <Input
                              type="number"
                              min={1}
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.item_id, e.target.value)}
                              className="h-7 w-16 text-center text-xs font-semibold font-mono rounded-lg p-0"
                            />

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={item.quantity >= item.availableStock}
                              onClick={() => handleUpdateQuantity(item.item_id, item.quantity + 1)}
                              className="h-7 w-7 rounded-lg text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Single-SN Input Mode (Quantity = 1) */}
                        {!isMulti ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                <Barcode className="w-3 h-3 text-indigo-500" />
                                <span>Serial Number / Identifier:</span>
                              </Label>
                              {sns[0] && (
                                <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  Specified
                                </span>
                              )}
                            </div>
                            <Input
                              placeholder="Scan barcode or type S/N..."
                              value={sns[0] || ''}
                              onChange={(e) => handleUpdateItemSN(item.item_id, 0, e.target.value)}
                              className="h-8 text-xs rounded-lg font-mono"
                            />
                          </div>
                        ) : (
                          /* Multi-SN Batch Input Mode (Quantity > 1) */
                          <div className="space-y-2.5 pt-1 border-t border-border/50">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Serial Numbers ({item.quantity} {item.quantity === 1 ? 'unit' : 'units'})</span>
                              </span>

                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${
                                  filledSNCount === item.quantity
                                    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                    : filledSNCount > 0
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    : 'bg-muted text-muted-foreground border-border/50'
                                }`}>
                                  Filled {filledSNCount}/{item.quantity}
                                </span>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowBatchInput(prev => ({ ...prev, [item.item_id]: !prev[item.item_id] }))}
                                  className="h-6 px-2 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-500/10 rounded-lg gap-1 cursor-pointer"
                                  title="Toggle batch S/N paste"
                                >
                                  <ClipboardPaste className="w-3 h-3" />
                                  <span>{isBatchOpen ? 'Close Batch' : 'Batch Paste'}</span>
                                </Button>
                              </div>
                            </div>

                            {/* Batch Paste / Scanner Bar */}
                            {isBatchOpen && (
                              <div className="p-2.5 rounded-lg bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 space-y-2 animate-in fade-in duration-200">
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                    <ClipboardPaste className="w-3 h-3 inline" />
                                    <span>Paste or scan multiple S/Ns (separated by comma or Enter):</span>
                                  </span>
                                  {filledSNCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleClearItemSNs(item.item_id)}
                                      className="text-destructive hover:underline text-[10px]"
                                    >
                                      Clear all S/Ns
                                    </button>
                                  )}
                                </div>
                                <div className="flex gap-1.5">
                                  <Input
                                    placeholder="e.g. SN001, SN002, SN003..."
                                    value={batchInputText[item.item_id] || ''}
                                    onChange={(e) => setBatchInputText(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleApplyBatchSN(item.item_id);
                                      }
                                    }}
                                    className="h-8 text-xs font-mono rounded-lg flex-1"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleApplyBatchSN(item.item_id)}
                                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-lg cursor-pointer shrink-0"
                                  >
                                    Import
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Individual Unit S/N Input Slots */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                              {sns.map((snVal, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-1.5 bg-muted/20 p-1.5 rounded-lg border border-border/40">
                                  <span className="text-[10px] font-semibold text-muted-foreground w-12 shrink-0 text-right">
                                    Unit #{sIdx + 1}:
                                  </span>
                                  <Input
                                    placeholder={`S/N #${sIdx + 1}`}
                                    value={snVal}
                                    onChange={(e) => handleUpdateItemSN(item.item_id, sIdx, e.target.value)}
                                    className="h-7 text-[11px] rounded-lg font-mono flex-1 p-1.5"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submitting || cart.length === 0 || !selectedProjectId}
                className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Saving...' : `Confirm Checkout (${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'})`}</span>
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </form>
  );
};

export default CheckoutPosTerminal;
