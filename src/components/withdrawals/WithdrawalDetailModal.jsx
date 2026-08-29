import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  FileText, CheckCircle2, Clock, XCircle, AlertTriangle, 
  Building2, User, Calendar, MapPin, Package, ArrowRight, ShieldAlert 
} from 'lucide-react';
import { format } from 'date-fns';

const WithdrawalDetailModal = ({
  order,
  orderDetails = [],
  isOpen,
  onClose,
  isAdmin = false,
  onApproveOrder,
  onOpenRejectModal,
  onCompleteOrder,
  onDownloadPDF
}) => {
  if (!order) return null;

  const isPending = order.status === 'pending';
  const isApproved = order.status === 'approved';
  const isCompleted = order.status === 'completed';
  const isRejected = order.status === 'rejected';
  const hasShortage = order.has_shortage || order.is_shortage_override;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-3 border-b border-border/40 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>ใบคำขอเบิกจ่าย #{order.id?.slice(0, 8)}</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  สร้างเมื่อ: {order.requested_at ? format(new Date(order.requested_at), 'dd/MM/yyyy HH:mm:ss') : '-'}
                </p>
              </div>
            </div>

            {/* Status Pill */}
            <div className="shrink-0">
              {isPending && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5" /> รออนุมัติจากแอดมิน
                </span>
              )}
              {isApproved && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> อนุมัติแล้ว (รอส่งมอบ)
                  {hasShortage && <span className="text-amber-500 font-extrabold">*ของไม่ครบ</span>}
                </span>
              )}
              {isCompleted && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> รับของเรียบร้อย
                </span>
              )}
              {isRejected && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                  <XCircle className="w-3.5 h-3.5" /> ปฏิเสธคำขอ
                </span>
              )}
            </div>
          </div>

          {/* Visual Requisition Workflow Stepper */}
          {!isRejected && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-bold">
                {/* Step 1: Requested */}
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-mono">
                    1
                  </div>
                  <span>ยื่นคำขอเบิก</span>
                </div>

                <div className={`flex-1 h-1 mx-3 rounded-full ${isApproved || isCompleted ? 'bg-indigo-600' : 'bg-muted'}`} />

                {/* Step 2: Approved */}
                <div className={`flex items-center gap-2 ${isApproved || isCompleted ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                    isApproved || isCompleted ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <span>อนุมัติ & ตัดสต็อก</span>
                </div>

                <div className={`flex-1 h-1 mx-3 rounded-full ${isCompleted ? 'bg-indigo-600' : 'bg-muted'}`} />

                {/* Step 3: Completed */}
                <div className={`flex items-center gap-2 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${
                    isCompleted ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <span>รับมอบสินค้า</span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="py-3 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Order Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/40 dark:bg-muted/20 p-4 rounded-2xl border border-border/60 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                สถานที่จัดเก็บ (Location):
              </span>
              <p className="font-bold text-foreground">
                {order.projects?.project_code ? `[${order.projects.project_code}] ` : ''}{order.projects?.name || '-'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                ผู้ขอเบิก:
              </span>
              <p className="font-bold text-foreground">{order.profiles?.full_name || 'ผู้ใช้งาน'}</p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                วัตถุประสงค์:
              </span>
              <p className="font-semibold text-foreground">{order.purpose || 'ไม่ได้ระบุ'}</p>
            </div>

            {order.delivery_address && (
              <div className="space-y-1 sm:col-span-2">
                <span className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  สถานที่จัดส่ง / ผู้รับ:
                </span>
                <p className="font-semibold text-foreground">{order.delivery_address}</p>
              </div>
            )}

            {/* Shortage Override Notice */}
            {(order.is_shortage_override || order.override_reason) && (
              <div className="sm:col-span-2 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>บันทึกการอนุมัติกรณีของไม่ครบ (Shortage Override):</span>
                </p>
                <p className="text-[11px] pl-5">{order.override_reason || 'อนุมัติตัดสต็อกตามจำนวนที่มีอยู่จริงในคลัง'}</p>
              </div>
            )}

            {/* Rejection Reason Notice */}
            {order.reject_reason && (
              <div className="sm:col-span-2 bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-red-900 dark:text-red-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span>เหตุผลการปฏิเสธคำขอ:</span>
                </p>
                <p className="text-[11px] pl-5">{order.reject_reason}</p>
              </div>
            )}
          </div>

          {/* Requested Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>รายการวัสดุที่ขอเบิก ({orderDetails.length} รายการ)</span>
            </h4>

            <div className="border border-border/60 rounded-2xl overflow-hidden glass shadow-2xs">
              <Table>
                <TableHeader className="bg-muted/50 text-xs">
                  <TableRow>
                    <TableHead>รายการวัสดุ</TableHead>
                    <TableHead className="text-center">ขอเบิก</TableHead>
                    <TableHead className="text-center">ตัดสต็อกจริง</TableHead>
                    <TableHead className="text-center text-amber-600">ขาดส่ง (Shortage)</TableHead>
                    <TableHead>สถานที่ส่ง / S/N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {orderDetails.map(item => {
                    const isApprovedOrCompleted = order.status === 'approved' || order.status === 'completed';
                    const deducted = item.deducted_quantity !== undefined && item.deducted_quantity !== null
                      ? item.deducted_quantity
                      : (isApprovedOrCompleted ? item.quantity : 0);
                    const shortage = item.shortage_quantity !== undefined && item.shortage_quantity !== null
                      ? item.shortage_quantity
                      : 0;

                    return (
                      <TableRow key={item.id} className="hover:bg-accent/40">
                        <TableCell>
                          <div className="font-bold text-foreground">{item.items?.name}</div>
                          {item.part_number && (
                            <span className="text-[10px] text-muted-foreground font-mono">PN: {item.part_number}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold font-mono text-foreground">
                          {item.quantity} {item.items?.unit}
                        </TableCell>
                        <TableCell className="text-center">
                          {isPending ? (
                            <span className="text-muted-foreground italic font-normal text-[11px]">- (รออนุมัติ)</span>
                          ) : isApprovedOrCompleted ? (
                            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              {deducted} {item.items?.unit}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold font-mono text-amber-600">
                          {shortage > 0 ? `${shortage} ${item.items?.unit}` : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          <div>{item.delivery_to || order.delivery_address || '-'}</div>
                          {item.serial_number && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono truncate max-w-[140px]" title={item.serial_number}>
                              S/N: {item.serial_number}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDownloadPDF(order, orderDetails)}
            className="rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1.5 cursor-pointer h-10"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>พิมพ์ / ดาวน์โหลด PDF ใบเบิกของ</span>
          </Button>

          <div className="flex items-center gap-2">
            {isAdmin && isPending && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="rounded-xl text-xs font-bold cursor-pointer h-10"
                  onClick={() => onOpenRejectModal(order)}
                >
                  ปฏิเสธคำขอ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-10 shadow-sm"
                  onClick={() => onApproveOrder(order.id)}
                >
                  อนุมัติบิลนี้
                </Button>
              </>
            )}

            {isApproved && (
              <Button
                type="button"
                size="sm"
                className="rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer h-10 shadow-sm"
                onClick={() => onCompleteOrder(order.id)}
              >
                ยืนยันรับของเสร็จสิ้น
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-xl text-xs h-10"
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalDetailModal;
