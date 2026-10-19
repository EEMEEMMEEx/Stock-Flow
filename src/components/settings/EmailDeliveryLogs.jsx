import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Mail, CheckCircle2, XCircle, RefreshCw, Search, Clock, AlertCircle, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatThaiDateTime } from '@/lib/emailRenderer';
import { useTranslation } from '@/i18n';

const PAGE_SIZE = 15;

const EVENT_THAI_NAMES = {
  withdrawal_submitted: '1. ส่งคำขอเบิก',
  withdrawal_approved: '2. อนุมัติคำขอเบิก',
  withdrawal_rejected: '3. ไม่อนุมัติคำขอเบิก',
  withdrawal_completed: '4. จ่ายวัสดุเสร็จสมบูรณ์',
  stock_in_created: '5. บันทึกรับเข้าสต็อก',
  low_stock_alert: '6. สต็อกถึงจุดสั่งซื้อ',
  checkout_submitted: '7. ส่งคำขอยืมอุปกรณ์',
  checkout_approved: '8. อนุมัติคำขอยืมอุปกรณ์',
  checkout_rejected: '9. ไม่อนุมัติคำขอยืมอุปกรณ์',
  checkout_handed_over: '10. ส่งมอบอุปกรณ์',
  checkout_due_soon: '11. ใกล้ถึงกำหนดส่งคืน',
  checkout_overdue: '12. เกินกำหนดส่งคืน',
  checkout_returned: '13. รับคืนอุปกรณ์เสร็จสิ้น',
  withdrawal_reverted: '14. ย้อนสถานะคำขอเบิก',
  checkout_reverted: '15. ย้อนสถานะรายการยืม',
  test_email: 'ทดสอบการเชื่อมต่อ SMTP',
  user_invitation: 'เชิญผู้ใช้ใหม่',
};

export default function EmailDeliveryLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_delivery_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchQuery.trim()) {
        const term = `%${searchQuery.trim()}%`;
        query = query.or(`recipient.ilike.${term},subject.ilike.${term},event_type.ilike.${term}`);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) {
        // Table may not exist yet or no rows
        console.warn('[EmailDeliveryLogs] Fetch error:', error.message);
        setLogs([]);
        setTotalCount(0);
      } else {
        setLogs(data || []);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.warn('[EmailDeliveryLogs] Query failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            {t('settings.emailLogs.title', 'ประวัติการส่งอีเมล (Email Delivery Logs)')}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t('settings.emailLogs.subtitle', 'ประวัติการส่งการแจ้งเตือนและผลการจัดส่งผ่าน SMTP Server')}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'รีเฟรช')}
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder={t('settings.emailLogs.searchPlaceholder', 'ค้นหาตามผู้รับ, หัวข้อ, หรือประเภทเหตุการณ์...')}
            className="pl-8 h-8.5 text-xs rounded-lg bg-background border border-input"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">{t('settings.emailLogs.allStatus', 'สถานะทั้งหมด')}</option>
            <option value="sent">{t('settings.emailLogs.sentOnly', 'ส่งสำเร็จ (Sent)')}</option>
            <option value="failed">{t('settings.emailLogs.failedOnly', 'ส่งไม่สำเร็จ (Failed)')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('settings.emailLogs.timestamp', 'เวลา')}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('settings.emailLogs.event', 'เหตุการณ์')}</th>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('settings.emailLogs.recipient', 'ผู้รับ')}</th>
                <th className="py-2.5 px-3">{t('settings.emailLogs.subject', 'หัวข้อ')}</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">{t('settings.emailLogs.status', 'สถานะ')}</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('common.actions', 'ดู')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                    {t('common.loading', 'กำลังโหลดข้อมูล...')}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                    <Mail className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    {t('settings.emailLogs.noLogs', 'ยังไม่มีประวัติการส่งอีเมลในระบบ')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isSent = log.status === 'sent';
                  const eventLabel = EVENT_THAI_NAMES[log.event_type] || log.event_type || 'ทั่วไป';

                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                        {formatThaiDateTime(log.created_at)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-foreground">
                        <span className="px-2 py-0.5 rounded bg-muted/60 text-[11px] font-medium border border-border/50">
                          {eventLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-foreground max-w-[200px] truncate" title={log.recipient}>
                        {log.recipient}
                      </td>
                      <td className="py-2.5 px-3 text-foreground font-medium max-w-[280px] truncate" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('settings.emailLogs.sentBadge', 'ส่งสำเร็จ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                            <XCircle className="w-3 h-3" />
                            {t('settings.emailLogs.failedBadge', 'ล้มเหลว')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-7 w-7 p-0 rounded-md hover:bg-muted cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > PAGE_SIZE && (
          <div className="py-2.5 px-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>
              {t('settings.emailLogs.pageSummary', {
                from: page * PAGE_SIZE + 1,
                to: Math.min((page + 1) * PAGE_SIZE, totalCount),
                total: totalCount
              })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="h-7 w-7 p-0 rounded cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="px-2 font-mono text-[11px] font-semibold">
                {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => setPage(p => p + 1)}
                className="h-7 w-7 p-0 rounded cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-lg rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                {selectedLog.status === 'sent' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
                {t('settings.emailLogs.detailTitle', 'รายละเอียดการส่งอีเมล')}
              </DialogTitle>
              <DialogDescription className="text-xs">
                ID: <span className="font-mono">{selectedLog.id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <span className="text-muted-foreground">{t('settings.emailLogs.timestamp', 'เวลาที่ส่ง')}:</span>
                <span className="col-span-2 font-mono font-medium">{formatThaiDateTime(selectedLog.created_at)}</span>

                <span className="text-muted-foreground">{t('settings.emailLogs.event', 'ประเภทเหตุการณ์')}:</span>
                <span className="col-span-2 font-medium">{EVENT_THAI_NAMES[selectedLog.event_type] || selectedLog.event_type || '-'}</span>

                <span className="text-muted-foreground">{t('settings.emailLogs.recipient', 'ผู้รับ (To)')}:</span>
                <span className="col-span-2 font-mono font-medium break-all">{selectedLog.recipient}</span>

                {selectedLog.metadata?.cc && (
                  <>
                    <span className="text-muted-foreground">CC:</span>
                    <span className="col-span-2 font-mono break-all">{Array.isArray(selectedLog.metadata.cc) ? selectedLog.metadata.cc.join(', ') : selectedLog.metadata.cc}</span>
                  </>
                )}

                <span className="text-muted-foreground">{t('settings.emailLogs.status', 'สถานะ')}:</span>
                <span className="col-span-2 font-bold">
                  {selectedLog.status === 'sent' ? (
                    <span className="text-emerald-600">{t('settings.emailLogs.sentBadge', 'ส่งสำเร็จ')}</span>
                  ) : (
                    <span className="text-rose-600">{t('settings.emailLogs.failedBadge', 'ล้มเหลว')}</span>
                  )}
                </span>
              </div>

              <div>
                <span className="font-semibold text-foreground block mb-1">{t('settings.emailLogs.subject', 'หัวข้ออีเมล')}:</span>
                <div className="p-2.5 rounded-lg bg-background border border-border font-medium">
                  {selectedLog.subject}
                </div>
              </div>

              {selectedLog.message_id && (
                <div>
                  <span className="font-semibold text-foreground block mb-1">Message-ID:</span>
                  <div className="p-2 rounded bg-muted/40 border border-border/40 font-mono text-[11px] break-all">
                    {selectedLog.message_id}
                  </div>
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <span className="font-semibold text-rose-600 flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('settings.emailLogs.errorMessage', 'ข้อผิดพลาด (Error Message)')}:
                  </span>
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[11px] whitespace-pre-wrap break-all">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
