import fs from 'node:fs';

// 1. Patch ProjectLocationSelector.jsx
const selectorPath = 'src/components/common/ProjectLocationSelector.jsx';
let selectorContent = fs.readFileSync(selectorPath, 'utf8');
const selectorTarget = `        {showCount && (
          <span className="text-[11px] text-muted-foreground font-normal">
            {projects.length} {t('common.location')}
          </span>
        )}`;
const selectorReplacement = `        {showCount && (
          <span className="text-xs text-muted-foreground font-normal">
            {projects.length} {t('common.location')}
          </span>
        )}`;

if (selectorContent.includes(selectorTarget)) {
  selectorContent = selectorContent.replace(selectorTarget, selectorReplacement);
  fs.writeFileSync(selectorPath, selectorContent, 'utf8');
  console.log('Patched ProjectLocationSelector.jsx (LF)');
} else if (selectorContent.includes(selectorTarget.replace(/\n/g, '\r\n'))) {
  selectorContent = selectorContent.replace(selectorTarget.replace(/\n/g, '\r\n'), selectorReplacement.replace(/\n/g, '\r\n'));
  fs.writeFileSync(selectorPath, selectorContent, 'utf8');
  console.log('Patched ProjectLocationSelector.jsx (CRLF)');
} else {
  console.warn('Could not find selector target in ProjectLocationSelector.jsx');
}

// 2. Patch StockIn.jsx
const stockInPath = 'src/pages/StockIn.jsx';
let content = fs.readFileSync(stockInPath, 'utf8');
const isCRLF = content.includes('\r\n');
const nl = isCRLF ? '\r\n' : '\n';

function replaceBlock(targetStr, replacementStr, label) {
  const normTarget = targetStr.replace(/\r?\n/g, nl);
  const normReplacement = replacementStr.replace(/\r?\n/g, nl);
  if (content.includes(normTarget)) {
    content = content.replace(normTarget, normReplacement);
    console.log(`[PASS] Patched: ${label}`);
  } else {
    console.error(`[FAIL] Could not find target for: ${label}`);
    process.exit(1);
  }
}

// A. Add debouncedPreviewSearch
replaceBlock(
  `  const [previewSearch, setPreviewSearch] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');`,
  `  const [previewSearch, setPreviewSearch] = useState('');
  const [debouncedPreviewSearch, setDebouncedPreviewSearch] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');`,
  'A. Add debouncedPreviewSearch state'
);

// B. Add debounce effect for previewSearch
replaceBlock(
  `  // 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);`,
  `  // 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 300ms debounce for CSV preview search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPreviewSearch(previewSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [previewSearch]);`,
  'B. Add 300ms debounce for previewSearch'
);

// C. Update filteredPreviewItems to use debouncedPreviewSearch
replaceBlock(
  `  // Filtered preview items for interactive preview search
  const filteredPreviewItems = useMemo(() => {
    if (!previewSearch.trim()) return previewItems;
    const q = previewSearch.toLowerCase();
    return previewItems.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.part_number && i.part_number.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q)) ||
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }, [previewItems, previewSearch]);`,
  `  // Filtered preview items for interactive preview search
  const filteredPreviewItems = useMemo(() => {
    if (!debouncedPreviewSearch.trim()) return previewItems;
    const q = debouncedPreviewSearch.toLowerCase();
    return previewItems.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.part_number && i.part_number.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q)) ||
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }, [previewItems, debouncedPreviewSearch]);`,
  'C. Use debouncedPreviewSearch in filteredPreviewItems'
);

// D. Warehouse filter select (accessible name)
replaceBlock(
  `          {/* Destination Warehouse Dropdown */}
          <div className="w-full sm:w-56 shrink-0">
            <select
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-3 text-xs rounded-lg bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >`,
  `          {/* Destination Warehouse Dropdown */}
          <div className="w-full sm:w-56 shrink-0">
            <select
              id="warehouse-filter-select"
              aria-label={t('stockIn.destinationWarehouse', 'คลังสินค้าปลายทาง')}
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-3 text-xs rounded-lg bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >`,
  'D. Warehouse filter select accessible attributes'
);

// E. Main Table aria-label
replaceBlock(
  `      {/* Main Stock Receipts Table */}
      <Card className="overflow-hidden rounded-xl bg-card border border-border shadow-xs">
        <div className="overflow-x-auto">
        <Table>`,
  `      {/* Main Stock Receipts Table */}
      <Card className="overflow-hidden rounded-xl bg-card border border-border shadow-xs">
        <div className="overflow-x-auto">
        <Table aria-label={t('stockIn.title', 'รายการรับเข้าพัสดุ')}>`,
  'E. Main Table aria-label'
);

// F. Snippet badge type ramp (text-[11px] -> text-xs)
replaceBlock(
  `                    {/* Matched item snippet badge (ทางเลือก ข) */}
                    {o.matched_items_snippet && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 max-w-md truncate"
                          title={o.matched_items_snippet}
                        >`,
  `                    {/* Matched item snippet badge (ทางเลือก ข) */}
                    {o.matched_items_snippet && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 max-w-md truncate"
                          title={o.matched_items_snippet}
                        >`,
  'F. Snippet badge type ramp text-xs'
);

// G. Pagination buttons touch target
replaceBlock(
  `          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer shadow-xs"
              aria-label={t('common.previous', 'Previous')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <span>{t('items.pagination.page', 'Page')}</span>
              <span className="font-mono font-bold text-foreground px-2 py-0.5 rounded bg-muted/60 border border-border/60">
                {currentPage}
              </span>
              <span>{t('items.pagination.of', 'of')}</span>
              <span className="font-mono font-bold text-foreground">{totalPages}</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer shadow-xs"
              aria-label={t('common.next', 'Next')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>`,
  `          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer shadow-xs flex items-center justify-center"
              aria-label={t('common.previous', 'Previous')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <span>{t('items.pagination.page', 'Page')}</span>
              <span className="font-mono font-bold text-foreground px-2 py-0.5 rounded bg-muted/60 border border-border/60">
                {currentPage}
              </span>
              <span>{t('items.pagination.of', 'of')}</span>
              <span className="font-mono font-bold text-foreground">{totalPages}</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 rounded-lg border-border text-foreground hover:bg-accent disabled:opacity-30 cursor-pointer shadow-xs flex items-center justify-center"
              aria-label={t('common.next', 'Next')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>`,
  'G. Pagination buttons min-h 44px'
);

// H. CSV Preview Summary Badges (text-[11px] -> text-xs)
replaceBlock(
  `                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-500/15 text-indigo-600 border border-indigo-500/30">
                  PARENT: {previewParentCount}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-500/15 text-blue-600 border border-blue-500/30">
                  CHILD: {previewChildCount}
                </span>`,
  `                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  PARENT: {previewParentCount}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  CHILD: {previewChildCount}
                </span>`,
  'H. CSV Preview Summary Badges text-xs'
);

// I. CSV Preview ProjectLocationSelector (add id)
replaceBlock(
  `            {/* Top Toolbar: Destination Project & Storage Location Selector */}
            <div className="bg-muted/30 p-3.5 rounded-xl border border-border space-y-3">
              <ProjectLocationSelector
                projects={projects}
                value={previewProjectId}
                onChange={handlePreviewProjectChange}
                required={true}
                mode="dual"
                size="sm"
                label="1. Select Project & Storage Location"
                showSummaryCard={false}
              />`,
  `            {/* Top Toolbar: Destination Project & Storage Location Selector */}
            <div className="bg-muted/30 p-3.5 rounded-xl border border-border space-y-3">
              <ProjectLocationSelector
                id="preview-project-selector"
                projects={projects}
                value={previewProjectId}
                onChange={handlePreviewProjectChange}
                required={true}
                mode="dual"
                size="sm"
                label="1. Select Project & Storage Location"
                showSummaryCard={false}
              />`,
  'I. Preview ProjectLocationSelector id'
);

// J. CSV Preview Warehouse Buttons (text-[11px] -> text-xs & touch target)
replaceBlock(
  `                  {/* Quick Warehouse Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      size="xs"
                      variant={selectedQtySource === 'คงเหลือ' ? 'default' : 'outline'}
                      onClick={() => handleChangeQtySource('คงเหลือ')}
                      className={\`h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 \${
                        selectedQtySource === 'คงเหลือ'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'border-border/60 hover:bg-muted'
                      }\`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>{t('stockIn.qtySourceTotal')}</span>
                    </Button>

                    {csvDetectedWarehouses.map(wh => {
                      const isSelected = selectedQtySource === wh;
                      return (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => handleChangeQtySource(wh)}
                          className={\`h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 \${
                            isSelected
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                              : 'border-border/60 hover:bg-muted text-foreground'
                          }\`}
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      );
                    })}
                  </div>`,
  `                  {/* Quick Warehouse Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      size="xs"
                      variant={selectedQtySource === 'คงเหลือ' ? 'default' : 'outline'}
                      onClick={() => handleChangeQtySource('คงเหลือ')}
                      className={\`min-h-[44px] sm:min-h-7 h-auto py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 \${
                        selectedQtySource === 'คงเหลือ'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'border-border/60 hover:bg-muted'
                      }\`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>{t('stockIn.qtySourceTotal')}</span>
                    </Button>

                    {csvDetectedWarehouses.map(wh => {
                      const isSelected = selectedQtySource === wh;
                      return (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => handleChangeQtySource(wh)}
                          className={\`min-h-[44px] sm:min-h-7 h-auto py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 \${
                            isSelected
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                              : 'border-border/60 hover:bg-muted text-foreground'
                          }\`}
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      );
                    })}
                  </div>`,
  'J. CSV Preview Warehouse Buttons text-xs and touch target'
);

// K. Toggle Positive Only touch target
replaceBlock(
  `                {/* Filter Zero Qty Toggle */}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleToggleOnlyPositive}
                  className="h-7 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5 self-start sm:self-auto cursor-pointer"
                >`,
  `                {/* Filter Zero Qty Toggle */}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleToggleOnlyPositive}
                  className="min-h-[44px] sm:min-h-7 h-auto py-1 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5 self-start sm:self-auto cursor-pointer"
                >`,
  'K. Toggle Positive Only touch target'
);

// L. CSV Preview Search input aria-label
replaceBlock(
  `                <Input
                  placeholder={t('stockIn.csvImport.searchPreviewPlaceholder')}
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />`,
  `                <Input
                  aria-label={t('stockIn.csvImport.searchPreviewPlaceholder')}
                  placeholder={t('stockIn.csvImport.searchPreviewPlaceholder')}
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />`,
  'L. CSV Preview Search input aria-label'
);

// M. CSV Preview Table overflow-x-auto & min-w & aria-label
replaceBlock(
  `            {/* Preview Items Table */}
            <div className="border border-border rounded-xl overflow-hidden shadow-xs max-h-[44vh] overflow-y-auto">
              <Table>`,
  `            {/* Preview Items Table */}
            <div className="border border-border rounded-xl overflow-hidden shadow-xs max-h-[44vh] overflow-y-auto overflow-x-auto">
              <Table className="min-w-[700px]" aria-label="CSV Import Preview Table">`,
  'M. Preview Table overflow-x-auto and aria-label'
);

// N. Preview Table Cells (text-[10px], text-[11px] -> text-xs & delete button touch target)
replaceBlock(
  `                        <TableCell>
                          <span className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border \${
                            isChild 
                              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200' 
                              : 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-200'
                          }\`}>
                            <span>{isChild ? 'CHILD' : 'PARENT'}</span>
                            {isChild && <CornerDownRight className="w-3 h-3 text-blue-600 dark:text-blue-300 shrink-0" />}
                          </span>
                        </TableCell>

                        <TableCell className="font-mono text-muted-foreground text-[11px]">
                          {item.part_number || item.sku || '—'}
                        </TableCell>

                        <TableCell className={isChild ? 'pl-6' : ''}>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              {isChild && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0 select-none" />}
                              <span className={\`font-semibold \${isChild ? 'text-blue-950 dark:text-blue-200' : 'text-foreground'}\`}>
                                {item.name}
                              </span>
                            </div>
                            {item.parent_sku && isChild && (
                              <div className="text-[10px] text-muted-foreground font-mono pl-3">
                                Parent: {item.parent_sku}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {item.model || '—'}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          +{item.quantity}
                        </TableCell>

                        <TableCell className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          {item.notes || '—'}
                        </TableCell>

                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewItems(prev => prev.filter(x => x.tempId !== item.tempId))}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>`,
  `                        <TableCell>
                          <span className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border \${
                            isChild 
                              ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200' 
                              : 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-200'
                          }\`}>
                            <span>{isChild ? 'CHILD' : 'PARENT'}</span>
                            {isChild && <CornerDownRight className="w-3 h-3 text-blue-600 dark:text-blue-300 shrink-0" />}
                          </span>
                        </TableCell>

                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {item.part_number || item.sku || '—'}
                        </TableCell>

                        <TableCell className={isChild ? 'pl-6' : ''}>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              {isChild && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0 select-none" />}
                              <span className={\`font-semibold \${isChild ? 'text-blue-950 dark:text-blue-200' : 'text-foreground'}\`}>
                                {item.name}
                              </span>
                            </div>
                            {item.parent_sku && isChild && (
                              <div className="text-xs text-muted-foreground font-mono pl-3">
                                Parent: {item.parent_sku}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {item.model || '—'}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          +{item.quantity}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                          {item.notes || '—'}
                        </TableCell>

                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewItems(prev => prev.filter(x => x.tempId !== item.tempId))}
                            className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer flex items-center justify-center mx-auto"
                            aria-label={t('common.delete', 'ลบรายการ')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>`,
  'N. Preview Table Cells text-xs and trash touch target'
);

// O. Direct Entry Header icon & ProjectLocationSelector id
replaceBlock(
  `            <DialogHeader className="border-b border-border/40 pb-3">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
                <span>Direct Stock Receipt (Parent/Child Hierarchy)</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Destination Project & Storage Location Selection */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-3">
                <ProjectLocationSelector
                  projects={projects}
                  value={formData.project_id}
                  onChange={handleDirectProjectChange}
                  required={true}
                  mode="dual"
                  label="Project & Storage Location"
                  showSummaryCard={true}
                />`,
  `            <DialogHeader className="border-b border-border/40 pb-3">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowDownToLine className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                <span>Direct Stock Receipt (Parent/Child Hierarchy)</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Destination Project & Storage Location Selection */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-3">
                <ProjectLocationSelector
                  id="direct-project-selector"
                  projects={projects}
                  value={formData.project_id}
                  onChange={handleDirectProjectChange}
                  required={true}
                  mode="dual"
                  label="Project & Storage Location"
                  showSummaryCard={true}
                />`,
  'O. Direct Entry Header emerald icon and selector id'
);

// P. Quick filter buttons in Direct Entry (text-[10px] -> text-xs & touch target)
replaceBlock(
  `                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          const allAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, 'คงเหลือ', { filterZeroQty: false });
                          setLineItems(allAgg);
                          toast.success('Showing total balance across all warehouses');
                        }}
                        className="h-6 text-[10px] rounded-lg font-bold flex items-center gap-1"
                      >
                        <BarChart3 className="w-3 h-3 text-emerald-600" />
                        <span>Total Balance</span>
                      </Button>
                      {csvDetectedWarehouses.map(wh => (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const whAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, wh, { filterZeroQty: true });
                            setLineItems(whAgg);
                            toast.success(\`Filtered for [\${wh}]: \${whAgg.length} item(s)\`);
                          }}
                          className="h-6 text-[10px] rounded-lg font-bold border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1"
                        >
                          <Building2 className="w-3 h-3 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      ))}`,
  `                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          const allAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, 'คงเหลือ', { filterZeroQty: false });
                          setLineItems(allAgg);
                          toast.success('Showing total balance across all warehouses');
                        }}
                        className="min-h-[44px] sm:min-h-7 h-auto py-1 px-2.5 text-xs rounded-lg font-bold flex items-center gap-1"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Total Balance</span>
                      </Button>
                      {csvDetectedWarehouses.map(wh => (
                        <Button
                          key={wh}
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const whAgg = filterAndAggregateWarehouseItems(rawParsedCsvItems, wh, { filterZeroQty: true });
                            setLineItems(whAgg);
                            toast.success(\`Filtered for [\${wh}]: \${whAgg.length} item(s)\`);
                          }}
                          className="min-h-[44px] sm:min-h-7 h-auto py-1 px-2.5 text-xs rounded-lg font-bold border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1"
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{wh}</span>
                        </Button>
                      ))}`,
  'P. Quick filter buttons in Direct Entry'
);

// Q. Direct Entry Table aria-label
replaceBlock(
  `                <div className="border border-border rounded-xl overflow-x-auto shadow-xs max-h-[44vh] overflow-y-auto">
                  <Table>`,
  `                <div className="border border-border rounded-xl overflow-x-auto shadow-xs max-h-[44vh] overflow-y-auto">
                  <Table aria-label="Direct Entry Line Items Table">`,
  'Q. Direct Entry Table aria-label'
);

// R. Direct Entry Table Rows (aria-label on inputs, text-xs, emerald colors, CornerDownRight SVG, trash touch target)
replaceBlock(
  `                              <TableCell className="align-top">
                                <select 
                                  value={row.item_type} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'item_type', e.target.value)}
                                  className={\`h-9 w-full rounded-lg border px-1 text-[11px] font-bold \${isChild ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200'}\`}
                                >
                                  <option value="PARENT">PARENT</option>
                                  <option value="CHILD">CHILD</option>
                                </select>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="SKU-001" 
                                  value={row.sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'sku', e.target.value)} 
                                  className="h-9 text-xs font-mono font-semibold rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder={isChild ? "Parent SKU" : "-"} 
                                  disabled={!isChild}
                                  value={row.parent_sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'parent_sku', e.target.value)} 
                                  className="h-9 text-xs font-mono disabled:opacity-40 rounded-lg"
                                />
                              </TableCell>

                              <TableCell className={\`align-top \${isChild ? 'pl-6' : ''}\`}>
                                <div className="flex items-center gap-1">
                                  {isChild && <span className="text-blue-500 font-mono text-xs select-none">└─</span>}
                                  <Input 
                                    required
                                    placeholder={isChild ? "Enter child item name" : "Enter item name"} 
                                    value={row.name} 
                                    onChange={e => handleUpdateLineItem(row.tempId, 'name', e.target.value)} 
                                    className={\`h-9 text-xs rounded-lg \${isChild ? 'font-medium text-blue-950 dark:text-blue-200' : 'font-semibold'}\`}
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Model (optional)" 
                                  value={row.model} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'model', e.target.value)} 
                                  className="h-9 text-xs font-medium rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  type="number" 
                                  min="1" 
                                  required 
                                  value={row.quantity ?? ''} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'quantity', e.target.value)} 
                                  className="h-9 text-center text-xs font-bold px-1 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="S/N (optional)" 
                                  value={row.serial_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'serial_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Part No." 
                                  value={row.part_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'part_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  placeholder="Notes" 
                                  value={row.notes} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'notes', e.target.value)} 
                                  className="h-9 text-xs rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top text-center">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                                  onClick={() => handleRemoveLineItem(row.tempId)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>`,
  `                              <TableCell className="align-top">
                                <select 
                                  aria-label={\`Item Type \${row.name || row.tempId}\`}
                                  value={row.item_type} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'item_type', e.target.value)}
                                  className={\`h-9 w-full rounded-lg border px-1 text-xs font-bold \${isChild ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700' : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700'}\`}
                                >
                                  <option value="PARENT">PARENT</option>
                                  <option value="CHILD">CHILD</option>
                                </select>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`SKU \${row.name || row.tempId}\`}
                                  placeholder="SKU-001" 
                                  value={row.sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'sku', e.target.value)} 
                                  className="h-9 text-xs font-mono font-semibold rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Parent SKU \${row.name || row.tempId}\`}
                                  placeholder={isChild ? "Parent SKU" : "-"} 
                                  disabled={!isChild}
                                  value={row.parent_sku} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'parent_sku', e.target.value)} 
                                  className="h-9 text-xs font-mono disabled:opacity-40 rounded-lg"
                                />
                              </TableCell>

                              <TableCell className={\`align-top \${isChild ? 'pl-6' : ''}\`}>
                                <div className="flex items-center gap-1">
                                  {isChild && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0 inline-block select-none" aria-hidden="true" />}
                                  <Input 
                                    aria-label={\`Item Name \${row.tempId}\`}
                                    required
                                    placeholder={isChild ? "Enter child item name" : "Enter item name"} 
                                    value={row.name} 
                                    onChange={e => handleUpdateLineItem(row.tempId, 'name', e.target.value)} 
                                    className={\`h-9 text-xs rounded-lg \${isChild ? 'font-medium text-blue-950 dark:text-blue-200' : 'font-semibold'}\`}
                                  />
                                </div>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Model \${row.name || row.tempId}\`}
                                  placeholder="Model (optional)" 
                                  value={row.model} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'model', e.target.value)} 
                                  className="h-9 text-xs font-medium rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Quantity \${row.name || row.tempId}\`}
                                  type="number" 
                                  min="1" 
                                  required 
                                  value={row.quantity ?? ''} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'quantity', e.target.value)} 
                                  className="h-9 text-center text-xs font-bold px-1 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Serial Number \${row.name || row.tempId}\`}
                                  placeholder="S/N (optional)" 
                                  value={row.serial_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'serial_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Part Number \${row.name || row.tempId}\`}
                                  placeholder="Part No." 
                                  value={row.part_number} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'part_number', e.target.value)} 
                                  className="h-9 text-xs font-mono rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input 
                                  aria-label={\`Notes \${row.name || row.tempId}\`}
                                  placeholder="Notes" 
                                  value={row.notes} 
                                  onChange={e => handleUpdateLineItem(row.tempId, 'notes', e.target.value)} 
                                  className="h-9 text-xs rounded-lg"
                                />
                              </TableCell>

                              <TableCell className="align-top text-center">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer flex items-center justify-center mx-auto"
                                  onClick={() => handleRemoveLineItem(row.tempId)}
                                  aria-label={t('common.delete', 'ลบรายการ')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>`,
  'R. Direct Entry Table Rows'
);

// S. Receipt Summary calculation colors (emerald & blue-400)
replaceBlock(
  `              {/* Receipt Summary Calculation */}
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border text-sm">
                <div className="flex gap-6 text-xs sm:text-sm font-medium flex-wrap">
                  <span>Total Items: <strong className="text-foreground font-bold">{totalItemsCount}</strong></span>
                  <span>Parent Items: <strong className="text-green-600 font-bold">{lineItems.filter(i => i.item_type === 'PARENT').length}</strong></span>
                  <span>Child Items: <strong className="text-blue-600 font-bold">{lineItems.filter(i => i.item_type === 'CHILD').length}</strong></span>
                  <span>Total Quantity: <strong className="text-emerald-600 font-bold">{totalQuantitySum}</strong> pcs</span>
                </div>
              </div>`,
  `              {/* Receipt Summary Calculation */}
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border text-sm">
                <div className="flex gap-6 text-xs sm:text-sm font-medium flex-wrap">
                  <span>Total Items: <strong className="text-foreground font-bold">{totalItemsCount}</strong></span>
                  <span>Parent Items: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{lineItems.filter(i => i.item_type === 'PARENT').length}</strong></span>
                  <span>Child Items: <strong className="text-blue-600 dark:text-blue-400 font-bold">{lineItems.filter(i => i.item_type === 'CHILD').length}</strong></span>
                  <span>Total Quantity: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{totalQuantitySum}</strong> pcs</span>
                </div>
              </div>`,
  'S. Receipt Summary calculation colors'
);

fs.writeFileSync(stockInPath, content, 'utf8');
console.log('StockIn.jsx patched successfully!');
