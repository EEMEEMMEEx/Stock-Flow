import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import ReportEmptyState from './ReportEmptyState';
import { Skeleton } from '@/components/ui/skeleton';

const ReportDataTable = ({
  activeTab,
  reportData = [],
  sortConfig = { key: '', direction: '' },
  onSort,
  onResetFilters,
  loading = false
}) => {
  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 shrink-0 text-primary" />
    );
  };

  if (loading) {
    return (
      <Card className="border border-border/60 overflow-hidden shadow-xs">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (reportData.length === 0) {
    return <ReportEmptyState onResetFilters={onResetFilters} />;
  }

  return (
    <Card className="border border-border/60 overflow-hidden shadow-xs">
      <div className="overflow-x-auto max-h-[600px] relative">
        <Table>
          <TableHeader className="bg-muted/80 backdrop-blur sticky top-0 z-10 whitespace-nowrap shadow-xs">
            {activeTab === 'stock_in' && (
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-[130px]">
                  <button
                    onClick={() => onSort('received_date')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>วันที่รับเข้า</span>
                    {renderSortIcon('received_date')}
                  </button>
                </TableHead>

                <TableHead>
                  <button
                    onClick={() => onSort('projects.name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>โครงการ</span>
                    {renderSortIcon('projects.name')}
                  </button>
                </TableHead>

                <TableHead>
                  <button
                    onClick={() => onSort('items.name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>รายการวัสดุ / รุ่น</span>
                    {renderSortIcon('items.name')}
                  </button>
                </TableHead>

                <TableHead className="font-bold text-xs text-foreground">Supplier</TableHead>
                <TableHead className="font-bold text-xs text-foreground">เลข PO</TableHead>

                <TableHead className="text-right w-[140px]">
                  <button
                    onClick={() => onSort('quantity')}
                    className="flex items-center justify-end gap-1.5 font-bold text-xs text-foreground group w-full"
                  >
                    <span>จำนวนรับเข้า</span>
                    {renderSortIcon('quantity')}
                  </button>
                </TableHead>
              </TableRow>
            )}

            {activeTab === 'withdrawals' && (
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-[120px]">
                  <button
                    onClick={() => onSort('requested_at')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>วันที่เบิก</span>
                    {renderSortIcon('requested_at')}
                  </button>
                </TableHead>

                <TableHead>
                  <button
                    onClick={() => onSort('projects.name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>โครงการ</span>
                    {renderSortIcon('projects.name')}
                  </button>
                </TableHead>

                <TableHead>
                  <button
                    onClick={() => onSort('items.name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>รายการวัสดุ</span>
                    {renderSortIcon('items.name')}
                  </button>
                </TableHead>

                <TableHead className="font-bold text-xs text-foreground">ผู้เบิก</TableHead>

                <TableHead className="text-center font-bold text-xs text-foreground w-[150px]">
                  สถานะ
                </TableHead>

                <TableHead className="text-center font-bold text-xs text-foreground">
                  ขอเบิก
                </TableHead>

                <TableHead className="text-center font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  ตัดสต็อกจริง
                </TableHead>

                <TableHead className="text-center font-bold text-xs text-amber-600 dark:text-amber-400">
                  ขาดส่ง (Shortage)
                </TableHead>
              </TableRow>
            )}

            {activeTab === 'balance' && (
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead>
                  <button
                    onClick={() => onSort('project_name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>โครงการ</span>
                    {renderSortIcon('project_name')}
                  </button>
                </TableHead>

                <TableHead>
                  <button
                    onClick={() => onSort('item_name')}
                    className="flex items-center gap-1.5 font-bold text-xs text-foreground group"
                  >
                    <span>รายการวัสดุ</span>
                    {renderSortIcon('item_name')}
                  </button>
                </TableHead>

                <TableHead className="text-right">
                  <button
                    onClick={() => onSort('total_in')}
                    className="flex items-center justify-end gap-1.5 font-bold text-xs text-emerald-600 dark:text-emerald-400 group w-full"
                  >
                    <span>ยอดรับเข้า (In)</span>
                    {renderSortIcon('total_in')}
                  </button>
                </TableHead>

                <TableHead className="text-right">
                  <button
                    onClick={() => onSort('total_out')}
                    className="flex items-center justify-end gap-1.5 font-bold text-xs text-amber-600 dark:text-amber-400 group w-full"
                  >
                    <span>ยอดเบิกจ่าย (Out)</span>
                    {renderSortIcon('total_out')}
                  </button>
                </TableHead>

                <TableHead className="text-right">
                  <button
                    onClick={() => onSort('balance')}
                    className="flex items-center justify-end gap-1.5 font-bold text-xs text-foreground group w-full"
                  >
                    <span>ยอดคงเหลือ (Balance)</span>
                    {renderSortIcon('balance')}
                  </button>
                </TableHead>
              </TableRow>
            )}
          </TableHeader>

          <TableBody className="text-xs divide-y divide-border/40">
            {reportData.map((row, i) => (
              <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                {/* Stock In View Rows */}
                {activeTab === 'stock_in' && (
                  <>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">
                      {row.received_date}
                    </TableCell>

                    <TableCell className="font-semibold text-foreground">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-accent-foreground border border-border/50 text-[11px]">
                        {row.projects?.project_code ? `${row.projects.project_code} — ` : ''}
                        {row.projects?.name}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="font-medium text-foreground">{row.items?.name}</div>
                      {row.model && (
                        <span className="text-[10px] text-muted-foreground">รุ่น: {row.model}</span>
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground">{row.supplier || '-'}</TableCell>
                    <TableCell className="text-muted-foreground font-mono">{row.po_number || '-'}</TableCell>

                    <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{row.quantity?.toLocaleString('th-TH')} {row.items?.unit}
                    </TableCell>
                  </>
                )}

                {/* Withdrawals View Rows */}
                {activeTab === 'withdrawals' && (
                  <>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">
                      {new Date(row.requested_at).toLocaleDateString('th-TH')}
                    </TableCell>

                    <TableCell className="font-semibold text-foreground">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-accent-foreground border border-border/50 text-[11px]">
                        {row.projects?.project_code ? `${row.projects.project_code} — ` : ''}
                        {row.projects?.name}
                      </span>
                    </TableCell>

                    <TableCell className="font-medium text-foreground">{row.items?.name}</TableCell>

                    <TableCell className="text-muted-foreground">{row.profiles?.full_name || '-'}</TableCell>

                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          row.has_shortage
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : row.status === 'approved' || row.status === 'completed'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : row.status === 'rejected'
                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-yellow-50 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
                        }`}
                      >
                        {row.has_shortage ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{row.status} (ของไม่ครบ)</span>
                          </>
                        ) : row.status === 'approved' || row.status === 'completed' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{row.status}</span>
                          </>
                        ) : row.status === 'rejected' ? (
                          <>
                            <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>{row.status}</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 text-yellow-600 shrink-0" />
                            <span>{row.status}</span>
                          </>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="text-center font-semibold text-foreground">
                      {row.quantity} {row.items?.unit}
                    </TableCell>

                    <TableCell className="text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {row.deducted_quantity} {row.items?.unit}
                    </TableCell>

                    <TableCell className="text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5">
                      {row.shortage_quantity > 0 ? `${row.shortage_quantity} ${row.items?.unit}` : '-'}
                    </TableCell>
                  </>
                )}

                {/* Stock Balance View Rows */}
                {activeTab === 'balance' && (
                  <>
                    <TableCell className="font-semibold text-foreground">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-accent-foreground border border-border/50 text-[11px]">
                        {row.project_name}
                      </span>
                    </TableCell>

                    <TableCell className="font-medium text-foreground">{row.item_name}</TableCell>

                    <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      +{row.total_in?.toLocaleString('th-TH')}
                    </TableCell>

                    <TableCell className="text-right font-semibold text-amber-600 dark:text-amber-400">
                      -{row.total_out?.toLocaleString('th-TH')}
                    </TableCell>

                    <TableCell className="text-right font-bold text-foreground">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs ${
                          row.balance <= 0
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold'
                        }`}
                      >
                        {row.balance?.toLocaleString('th-TH')} {row.unit}
                      </span>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default ReportDataTable;
