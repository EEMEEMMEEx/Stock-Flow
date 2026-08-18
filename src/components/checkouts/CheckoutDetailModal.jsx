import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  FileText, Download, Printer, CheckCircle2, Clock, 
  AlertTriangle, User, Building2, Calendar, Phone, Layers, RotateCcw
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { MaterialCheckoutPDF, MaterialReturnPDF } from '@/lib/checkout-pdf-templates';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

const CheckoutDetailModal = ({
  isOpen,
  onClose,
  order,
  onOpenReturnModal
}) => {
  const [returnLogs, setReturnLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (order?.id && isOpen) {
      fetchReturnLogs(order.id);
    }
  }, [order?.id, isOpen]);

  const fetchReturnLogs = async (orderId) => {
    try {
      setLoadingLogs(true);
      const { data, error } = await supabase
        .from('checkout_return_logs')
        .select(`
          *,
          checkout_items (
            serial_number,
            items (name, unit)
          ),
          projects (name, project_code),
          profiles:received_by (full_name)
        `)
        .eq('checkout_order_id', orderId)
        .order('returned_at', { ascending: false });

      if (error) throw error;
      setReturnLogs(data || []);
    } catch (err) {
      console.error('Fetch return logs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  if (!order) return null;

  const checkoutItems = order.checkout_items || [];
  const totalBorrowed = checkoutItems.reduce((s, i) => s + Number(i.quantity_borrowed || 0), 0);
  const totalReturned = checkoutItems.reduce((s, i) => s + Number(i.quantity_returned || 0), 0);
  const totalDamaged = checkoutItems.reduce((s, i) => s + Number(i.quantity_damaged || 0) + Number(i.quantity_lost || 0), 0);
  const remaining = totalBorrowed - (totalReturned + totalDamaged);

  // PDF Export Handlers
  const handleDownloadCheckoutPDF = async () => {
    try {
      setGeneratingPdf(true);
      const blob = await pdf(<MaterialCheckoutPDF order={order} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Checkout_Slip_${order.order_number || 'DOC'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดใบยืมเครื่องมือสำเร็จ');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('ไม่สามารถสร้างไฟล์ PDF ใบยืมได้');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadReturnPDF = async () => {
    try {
      setGeneratingPdf(true);
      const blob = await pdf(<MaterialReturnPDF order={order} returnLogs={returnLogs} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Return_Receipt_${order.order_number || 'DOC'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดใบรับคืนพัสดุสำเร็จ');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('ไม่สามารถสร้างไฟล์ PDF ใบรับคืนได้');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl glass p-6 border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>รายละเอียดใบยืม-คืน</span>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                    {order.order_number}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ยืมเมื่อ: {format(new Date(order.checkout_date), 'dd/MM/yyyy HH:mm น.')}
                </p>
              </div>
            </div>

            {/* Status Badge */}
            {order.status === 'completed' ? (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                คืนครบแล้ว
              </span>
            ) : order.status === 'partial_returned' ? (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-600 border border-blue-500/30 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                คืนบางส่วน ({totalReturned}/{totalBorrowed})
              </span>
            ) : (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                กำลังยืม
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
          {/* Info Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-muted/30 border border-border/60 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">ผู้ขอยืม:</span>
                <strong className="text-foreground">{order.borrower_name}</strong>
              </div>
              {order.borrower_department && (
                <div className="text-muted-foreground pl-5.5">แผนก: {order.borrower_department}</div>
              )}
              {order.borrower_phone && (
                <div className="text-muted-foreground pl-5.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {order.borrower_phone}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-muted-foreground">คลังต้นทาง:</span>
                <strong className="text-foreground">{order.projects?.name}</strong>
              </div>
              <div className="flex items-center gap-2 pl-5.5 text-red-600 dark:text-red-400 font-semibold">
                <Calendar className="w-3 h-3" />
                <span>กำหนดส่งคืน: {format(new Date(order.expected_return_date), 'dd/MM/yyyy')}</span>
              </div>
              {order.purpose && (
                <div className="text-muted-foreground pl-5.5">งาน: {order.purpose}</div>
              )}
            </div>
          </div>

          {/* Borrowed Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>รายการอุปกรณ์ที่ยืม ({checkoutItems.length} รายการ)</span>
            </h4>

            <div className="rounded-2xl border border-border/70 overflow-hidden divide-y divide-border/40">
              <div className="bg-muted/50 p-2.5 grid grid-cols-12 text-[11px] font-bold text-muted-foreground">
                <div className="col-span-6">รายการอุปกรณ์</div>
                <div className="col-span-2 text-center">ยืมไป</div>
                <div className="col-span-2 text-center">คืนแล้ว</div>
                <div className="col-span-2 text-center">คงค้าง</div>
              </div>

              {checkoutItems.map((item, idx) => {
                const rem = item.quantity_borrowed - (item.quantity_returned + item.quantity_damaged + item.quantity_lost);
                return (
                  <div key={item.id || idx} className="p-2.5 grid grid-cols-12 text-xs items-center">
                    <div className="col-span-6 space-y-0.5">
                      <p className="font-bold text-foreground line-clamp-1">{item.items?.name || 'อุปกรณ์'}</p>
                      {item.serial_number && (
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">S/N: {item.serial_number}</p>
                      )}
                    </div>
                    <div className="col-span-2 text-center font-mono font-semibold">
                      {item.quantity_borrowed} {item.items?.unit || 'ชิ้น'}
                    </div>
                    <div className="col-span-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {item.quantity_returned}
                    </div>
                    <div className="col-span-2 text-center font-mono font-bold">
                      <span className={rem > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}>
                        {rem}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Return Audit Logs */}
          {returnLogs.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>ประวัติการรับคืน ({returnLogs.length} ครั้ง)</span>
              </h4>

              <div className="space-y-2">
                {returnLogs.map(log => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-muted/25 border border-border/40 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{log.checkout_items?.items?.name || 'อุปกรณ์'}</span>
                        {log.checkout_items?.serial_number && (
                          <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded font-bold">
                            S/N: {log.checkout_items.serial_number}
                          </span>
                        )}
                        <span>— คืน {log.returned_quantity} {log.checkout_items?.items?.unit || 'ชิ้น'}</span>
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.item_condition === 'normal' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                        }`}>
                          {log.item_condition === 'normal' ? 'ปกติ' : log.item_condition}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        รับเข้าคลัง: {log.projects?.name} • โดย: {log.profiles?.full_name || 'เจ้าหน้าที่'}
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-mono">
                      {format(new Date(log.returned_at), 'dd/MM/yyyy HH:mm')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap sm:justify-between border-t border-border/40 pt-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generatingPdf}
              onClick={handleDownloadCheckoutPDF}
              className="rounded-xl h-9 text-xs gap-1.5 font-bold shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>พิมพ์ใบยืมพัสดุ (PDF)</span>
            </Button>

            {returnLogs.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={generatingPdf}
                onClick={handleDownloadReturnPDF}
                className="rounded-xl h-9 text-xs gap-1.5 font-bold text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>พิมพ์ใบรับคืน (PDF)</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {remaining > 0 && onOpenReturnModal && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenReturnModal(order);
                }}
                className="rounded-xl h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-bold shadow-sm cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>รับคืนพัสดุ</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="rounded-xl h-9 text-xs font-semibold"
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutDetailModal;
