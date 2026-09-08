import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  FileText, Download, CheckCircle2, Clock, 
  User, Building2, Calendar, Phone, Layers, RotateCcw,
  CalendarClock, ArrowRight, Infinity as InfinityIcon
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
  canReturn = true,
  canExtend = true,
  onOpenReturnModal,
  onOpenExtendModal
}) => {
  const [returnLogs, setReturnLogs] = useState([]);
  const [extensionLogs, setExtensionLogs] = useState([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (order?.id && isOpen) {
      fetchReturnLogs(order.id);
      fetchExtensionLogs(order.id);
    }
  }, [order?.id, isOpen]);

  const fetchExtensionLogs = async (orderId) => {
    try {
      const { data, error } = await supabase
        .from('checkout_extension_logs')
        .select(`
          *,
          profiles:extended_by (full_name)
        `)
        .eq('checkout_order_id', orderId)
        .order('extended_at', { ascending: false });

      if (!error && data) {
        setExtensionLogs(data);
      }
    } catch (err) {
      console.warn('Fetch extension logs notice:', err);
    }
  };

  const fetchReturnLogs = async (orderId) => {
    try {
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
    }
  };

  if (!order) return null;

  const isIndefinite = order.borrow_type === 'indefinite' || !order.expected_return_date;
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
      toast.success('Checkout slip downloaded');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('Failed to generate checkout slip PDF');
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
      toast.success('Return receipt downloaded');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('Failed to generate return receipt PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] rounded-xl bg-card p-6 border border-border shadow-xl">
        <DialogHeader className="space-y-2 border-b border-border/40 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>Loan & Return Details</span>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                    {order.order_number}
                  </span>
                  {isIndefinite && (
                    <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <InfinityIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      Indefinite
                    </span>
                  )}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Borrowed: {order.checkout_date ? format(new Date(order.checkout_date), 'dd/MM/yyyy HH:mm') : '-'}
                </p>
              </div>
            </div>

            {/* Status Badge */}
            {order.status === 'completed' ? (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Completed
              </span>
            ) : order.status === 'partial_returned' ? (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-600 border border-blue-500/30 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Partially Returned ({totalReturned}/{totalBorrowed})
              </span>
            ) : (
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Active
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
          {/* Info Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/30 border border-border text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Borrower:</span>
                <strong className="text-foreground">{order.borrower_name}</strong>
              </div>
              {order.borrower_department && (
                <div className="text-muted-foreground pl-5.5">Department: {order.borrower_department}</div>
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
                <span className="text-muted-foreground">Source Project/Warehouse:</span>
                <strong className="text-foreground">{order.projects?.name}</strong>
              </div>
              <div className={`flex items-center gap-2 pl-5.5 font-semibold ${
                isIndefinite ? 'text-purple-600 dark:text-purple-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {isIndefinite ? <InfinityIcon className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                <span>
                  Due Date: {isIndefinite ? 'Indefinite' : (order.expected_return_date ? format(new Date(order.expected_return_date), 'dd/MM/yyyy') : '-')}
                </span>
              </div>
              {order.purpose && (
                <div className="text-muted-foreground pl-5.5">Purpose: {order.purpose}</div>
              )}
            </div>
          </div>

          {/* Borrowed Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Borrowed Items ({checkoutItems.length} items)</span>
            </h4>

            <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/40">
              <div className="bg-muted/50 p-2.5 grid grid-cols-12 text-[11px] font-bold text-muted-foreground">
                <div className="col-span-6">Item Name</div>
                <div className="col-span-2 text-center">Borrowed</div>
                <div className="col-span-2 text-center">Returned</div>
                <div className="col-span-2 text-center">Remaining</div>
              </div>

              {checkoutItems.map((item, idx) => {
                const rem = item.quantity_borrowed - (item.quantity_returned + item.quantity_damaged + item.quantity_lost);
                return (
                  <div key={item.id || idx} className="p-2.5 grid grid-cols-12 text-xs items-center">
                    <div className="col-span-6 space-y-0.5">
                      <p className="font-bold text-foreground line-clamp-1">{item.items?.name || 'Item'}</p>
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
                <span>Return History ({returnLogs.length} records)</span>
              </h4>

              <div className="space-y-2">
                {returnLogs.map(log => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-muted/25 border border-border/40 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{log.checkout_items?.items?.name || 'Item'}</span>
                        {log.checkout_items?.serial_number && (
                          <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded font-bold">
                            S/N: {log.checkout_items.serial_number}
                          </span>
                        )}
                        <span>— Returned {log.returned_quantity} {log.checkout_items?.items?.unit || 'ชิ้น'}</span>
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.item_condition === 'normal' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                        }`}>
                          {log.item_condition === 'normal' ? 'Normal' : log.item_condition}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Received into: {log.projects?.name} • By: {log.profiles?.full_name || 'Staff'}
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

          {/* Due Date Extension Audit Logs */}
          {extensionLogs.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Extension History ({extensionLogs.length} records)</span>
              </h4>

              <div className="space-y-2">
                {extensionLogs.map(log => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                        <span className="text-muted-foreground line-through font-mono text-[11px]">
                          {log.previous_due_date ? format(new Date(log.previous_due_date), 'dd/MM/yyyy') : 'Indefinite'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-amber-500" />
                        {log.new_due_date ? (
                          <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                            {format(new Date(log.new_due_date), 'dd/MM/yyyy')}
                          </span>
                        ) : (
                          <span className="font-bold text-purple-600 dark:text-purple-400 font-mono inline-flex items-center gap-1">
                            <InfinityIcon className="w-3 h-3" />
                            Indefinite
                          </span>
                        )}
                        {log.extension_reason && (
                          <span className="text-muted-foreground font-normal text-[11px]">
                            — &quot;{log.extension_reason}&quot;
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Extended by: {log.profiles?.full_name || 'Staff'}
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-mono self-end sm:self-auto">
                      {format(new Date(log.extended_at), 'dd/MM/yyyy HH:mm')}
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
              className="rounded-lg h-9 text-xs gap-1.5 font-semibold shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Print Loan Slip (PDF)</span>
            </Button>

            {returnLogs.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={generatingPdf}
                onClick={handleDownloadReturnPDF}
                className="rounded-lg h-9 text-xs gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Print Return Slip (PDF)</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isIndefinite ? (
              <div className="inline-flex items-center gap-1.5 px-3 rounded-lg h-9 bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-semibold select-none">
                <InfinityIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Indefinite Loan</span>
              </div>
            ) : (
              remaining > 0 && order.status !== 'completed' && onOpenExtendModal && canExtend && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onOpenExtendModal(order);
                  }}
                  className="rounded-lg h-9 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 text-xs gap-1.5 font-semibold shadow-2xs cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>Extend Due Date</span>
                </Button>
              )
            )}

            {remaining > 0 && onOpenReturnModal && canReturn && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenReturnModal(order);
                }}
                className="rounded-lg h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return Items</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutDetailModal;
