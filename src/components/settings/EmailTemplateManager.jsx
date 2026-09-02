import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Mail, Send, Sparkles, Check, X, Smartphone, Monitor, Code, 
  Users, ShieldCheck, ChevronRight, Search, RefreshCw, AlertCircle, Save, Info, RotateCcw
} from 'lucide-react';
import { getSampleEmailData, renderEmailHtml, SUPPORTED_EVENT_VARIABLES } from '@/lib/emailRenderer';
import { APP_CONFIG } from '@/config/appConfig';
import toast from 'react-hot-toast';
import { sendTestEmail } from '@/lib/emailService';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const DEFAULT_EVENTS_CONFIG = {
  withdrawal_submitted: {
    enabled: true,
    title: '1. ส่งคำขอเบิกจ่ายใหม่ (Withdrawal Submitted)',
    desc: 'แจ้งเตือนไปยังผู้อนุมัติและผู้ดูแลระบบเมื่อมีคำขอเบิกใหม่',
    primary_recipient: 'ผู้อนุมัติ / ผู้ดูแลระบบ',
    subject: '[StockFlow] คำขอเบิก {{request_no}} รอการอนุมัติ — {{project_name}}',
    status_label: 'รออนุมัติ / คำขอเบิกใหม่',
    status_type: 'warning',
    heading: 'มีคำขอเบิกจ่ายวัสดุใหม่เข้าระบบ',
    intro: 'สวัสดีครับ มีคำขอเบิกจ่ายวัสดุเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} รอการพิจารณาอนุมัติ กรุณาตรวจสอบรายละเอียดรายการวัสดุ',
    cta_label: 'ตรวจสอบและพิจารณาคำขอ',
    cta_url: '{{action_url}}',
    footer_note: 'กรุณาตรวจสอบและอนุมัติคำขอเบิกดังกล่าวตามขั้นตอนระบบ',
    roles: ['ADMIN', 'SUPERVISOR'],
    to_extra: '',
    cc_extra: ''
  },
  withdrawal_approved: {
    enabled: true,
    title: '2. อนุมัติคำขอเบิกจ่าย (Withdrawal Approved)',
    desc: 'แจ้งเตือนไปยังผู้ขอเบิกและเจ้าหน้าที่คลังเมื่อคำขอได้รับการอนุมัติ',
    primary_recipient: 'ผู้ขอเบิก (Requester)',
    subject: '[StockFlow] คำขอเบิก {{request_no}} ได้รับการอนุมัติแล้ว — {{project_name}}',
    status_label: 'อนุมัติแล้ว',
    status_type: 'approved',
    heading: 'คำขอเบิกจ่ายวัสดุของคุณได้รับการอนุมัติแล้ว',
    intro: 'เรียน คุณ {{user_name}} คำขอเบิกจ่ายวัสดุเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ได้รับการอนุมัติโดย {{approved_by}} เรียบร้อยแล้ว',
    cta_label: 'ดูรายละเอียดและเตรียมรับวัสดุ',
    cta_url: '{{action_url}}',
    footer_note: 'กรุณาติดต่อเจ้าหน้าที่คลังเพื่อรับมอบวัสดุตามเวลาที่กำหนด',
    roles: ['STAFF', 'ADMIN'],
    to_extra: '',
    cc_extra: ''
  },
  withdrawal_rejected: {
    enabled: true,
    title: '3. ปฏิเสธคำขอเบิกจ่าย (Withdrawal Rejected)',
    desc: 'แจ้งเตือนไปยังผู้ขอเบิกเมื่อคำขอไม่ได้รับการอนุมัติพร้อมระบุเหตุผล',
    primary_recipient: 'ผู้ขอเบิก (Requester)',
    subject: '[StockFlow] คำขอเบิก {{request_no}} ไม่ได้รับการอนุมัติ — {{project_name}}',
    status_label: 'ไม่ได้รับการอนุมัติ',
    status_type: 'rejected',
    heading: 'คำขอเบิกจ่ายวัสดุไม่ได้รับการอนุมัติ',
    intro: 'คำขอเบิกเลขที่ {{request_no}} สำหรับโครงการ {{project_name}} ไม่ได้รับการอนุมัติ กรุณาตรวจสอบเหตุผลและรายละเอียดด้านล่าง',
    cta_label: 'ดูรายละเอียดคำขอเบิก',
    cta_url: '{{action_url}}',
    footer_note: 'หากต้องการแก้ไขรายการ สามารถติดต่อผู้อนุมัติโครงการหรือส่งคำขอใหม่ได้',
    roles: ['STAFF'],
    to_extra: '',
    cc_extra: ''
  },
  withdrawal_completed: {
    enabled: true,
    title: '4. ส่งมอบและรับวัสดุสำเร็จ (Withdrawal Completed)',
    desc: 'แจ้งเตือนเมื่อการเบิกจ่ายเสร็จสิ้นและตัดสต็อกสมบูรณ์',
    primary_recipient: 'ผู้เบิก / ผู้ดูแลระบบ',
    subject: '[StockFlow] จ่ายวัสดุ {{request_no}} เรียบร้อยแล้ว',
    status_label: 'จ่ายวัสดุแล้ว',
    status_type: 'approved',
    heading: 'ดำเนินการจ่ายวัสดุเรียบร้อยแล้ว',
    intro: 'เรียน คุณ {{user_name}} รายการเบิกจ่ายวัสดุเลขที่ {{request_no}} ได้รับการยืนยันส่งมอบและเบิกจ่ายจากคลังเรียบร้อยแล้ว',
    cta_label: 'ดูประวัติการจ่ายวัสดุ',
    cta_url: '{{action_url}}',
    footer_note: 'ขอบคุณที่ใช้งานระบบ StockFlow Inventory Management',
    roles: ['ADMIN'],
    to_extra: '',
    cc_extra: ''
  },
  stock_in_created: {
    enabled: true,
    title: '5. บันทึกรับวัสดุเข้า Stock (Stock In Recorded)',
    desc: 'แจ้งเตือนเมื่อมีการบันทึกรับเข้าวัสดุล็อตใหม่ในโครงการ',
    primary_recipient: 'ผู้ดูแลคลัง / ผู้ดูแลระบบ',
    subject: '[StockFlow] รับเข้า Stock {{stock_in_no}} — {{project_name}}',
    status_label: 'รับเข้า Stock',
    status_type: 'info',
    heading: 'มีการรับวัสดุเข้าสต็อกเรียบร้อยแล้ว',
    intro: 'มีการบันทึกรายการรับเข้า Stock เลขที่ {{stock_in_no}} สำหรับโครงการ {{project_name}} เรียบร้อยแล้ว',
    cta_label: 'ดูรายการรับเข้า Stock',
    cta_url: '{{action_url}}',
    footer_note: 'รายการวัสดุใหม่ถูกเพิ่มเข้าสู่ยอดคงเหลือพร้อมเบิกทันที',
    roles: ['ADMIN', 'SUPERVISOR'],
    to_extra: '',
    cc_extra: ''
  },
  low_stock_alert: {
    enabled: true,
    title: '6. แจ้งเตือนพัสดุถึงจุดสั่งซื้อ (Low Stock Alert)',
    desc: 'แจ้งเตือนอัตโนมัติเมื่อจำนวนพัสดุในคลังลดลงถึงเกณฑ์สั่งซื้อเติมสต็อก',
    primary_recipient: 'ผู้ดูแลคลัง / ผู้อนุมัติ',
    subject: '[StockFlow] แจ้งเตือนรายการพัสดุถึงจุดสั่งซื้อ — {{item_name}} ({{project_name}})',
    status_label: 'ต้องเติมสต็อก',
    status_type: 'warning',
    heading: 'แจ้งเตือนรายการวัสดุถึงจุดสั่งซื้อ (Reorder Point Alert)',
    intro: 'รายการวัสดุ "{{item_name}}" ในโครงการ {{project_name}} มียอดคงเหลือปัจจุบัน {{current_stock}} ซึ่งต่ำกว่าเกณฑ์การสั่งซื้อเติมคลัง ({{threshold}})',
    cta_label: 'ดูรายการวัสดุและวางแผนสั่งซื้อ',
    cta_url: '{{action_url}}',
    footer_note: 'กรุณาตรวจสอบยอดคงเหลือและวางแผนจัดซื้อเพื่อความต่อเนื่องของโครงการ',
    roles: ['ADMIN', 'SUPERVISOR'],
    to_extra: '',
    cc_extra: ''
  }
};

const mergeEventsWithDefaults = (inputConfig) => {
  const merged = { ...DEFAULT_EVENTS_CONFIG };
  if (inputConfig && typeof inputConfig === 'object') {
    Object.keys(DEFAULT_EVENTS_CONFIG).forEach(key => {
      const defaultVal = DEFAULT_EVENTS_CONFIG[key];
      const savedVal = inputConfig[key];
      if (savedVal) {
        const isLegacyWithdrawalRejected = key === 'withdrawal_rejected' && (savedVal.status_label === 'ไม่อนุมัติ');
        const isLegacyLowStock = key === 'low_stock_alert' && (
          String(savedVal.heading || '').includes('เตือนภัย') ||
          String(savedVal.subject || '').includes('เตือนภัย') ||
          savedVal.status_label === 'Stock ต่ำกว่าเกณฑ์'
        );

        merged[key] = {
          ...defaultVal,
          ...savedVal,
          title: defaultVal.title,
          desc: defaultVal.desc,
          primary_recipient: defaultVal.primary_recipient,
          status_label: isLegacyWithdrawalRejected ? defaultVal.status_label : (isLegacyLowStock ? defaultVal.status_label : (savedVal.status_label || defaultVal.status_label)),
          status_type: defaultVal.status_type,
          heading: isLegacyLowStock ? defaultVal.heading : (savedVal.heading || defaultVal.heading),
          subject: isLegacyLowStock ? defaultVal.subject : (savedVal.subject || defaultVal.subject),
          intro: isLegacyLowStock ? defaultVal.intro : (savedVal.intro || defaultVal.intro),
        };
      }
    });
  }
  return merged;
};

const EmailTemplateManager = ({ 
  eventsConfig = DEFAULT_EVENTS_CONFIG, 
  brandingConfig = {},
  roles = [], 
  canUpdate = true,
  onSave = () => {}
}) => {
  const [events, setEvents] = useState(() => mergeEventsWithDefaults(eventsConfig));
  const [selectedEventKey, setSelectedEventKey] = useState('withdrawal_submitted');
  const [activeTab, setActiveTab] = useState('content'); // 'content' | 'recipients' | 'preview' | 'test'
  const [previewDevice, setPreviewDevice] = useState('desktop'); // 'desktop' | 'mobile'
  const [searchQuery, setSearchQuery] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Global Email Branding State
  const defaultBranding = {
    app_name: APP_CONFIG.name,
    logo_url: '',
    public_base_url: typeof window !== 'undefined' ? window.location.origin : 'https://stockflowth.online',
    accent_color: '#3b82f6',
    footer_text: 'หากคุณไม่ได้ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อความปลอดภัย'
  };
  const [branding, setBranding] = useState(() => ({ ...defaultBranding, ...brandingConfig }));

  // Test Email Modal
  const [isTestEmailOpen, setIsTestEmailOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (eventsConfig && Object.keys(eventsConfig).length > 0) {
      setEvents(mergeEventsWithDefaults(eventsConfig));
    }
  }, [eventsConfig]);

  useEffect(() => {
    setBranding({ ...defaultBranding, ...brandingConfig });
  }, [brandingConfig]);

  const selectedEvent = events[selectedEventKey] || DEFAULT_EVENTS_CONFIG[selectedEventKey] || {
    enabled: true,
    title: selectedEventKey,
    desc: '',
    primary_recipient: 'ผู้เกี่ยวข้อง',
    subject: '',
    status_label: '',
    status_type: 'info',
    heading: '',
    intro: '',
    cta_label: '',
    cta_url: '',
    footer_note: '',
    roles: [],
    to_extra: '',
    cc_extra: ''
  };

  const handleUpdateSelectedEvent = (field, value) => {
    setEvents(prev => ({
      ...prev,
      [selectedEventKey]: {
        ...prev[selectedEventKey],
        [field]: value
      }
    }));
    setIsDirty(true);
  };

  const handleResetCurrentEvent = () => {
    const defaultEvt = DEFAULT_EVENTS_CONFIG[selectedEventKey];
    if (defaultEvt) {
      setEvents(prev => ({
        ...prev,
        [selectedEventKey]: { ...defaultEvt }
      }));
      setIsDirty(true);
      toast.success(`รีเซ็ตแม่แบบ "${defaultEvt.title}" เป็นค่าเริ่มต้นเรียบร้อยแล้ว`);
    }
  };

  const handleResetAllEvents = () => {
    setEvents({ ...DEFAULT_EVENTS_CONFIG });
    setIsDirty(true);
    toast.success('รีเซ็ตแม่แบบอีเมลทั้งหมดเป็นค่าเริ่มต้นของระบบเรียบร้อยแล้ว');
  };

  const handleInsertVariable = (varCode) => {
    handleUpdateSelectedEvent('subject', (selectedEvent.subject || '') + ' ' + varCode);
  };

  const handleToggleRole = (roleCode) => {
    const currentRoles = selectedEvent.roles || [];
    const updatedRoles = currentRoles.includes(roleCode)
      ? currentRoles.filter(r => r !== roleCode)
      : [...currentRoles, roleCode];
    handleUpdateSelectedEvent('roles', updatedRoles);
  };

  const handleSaveAll = () => {
    if (!canUpdate) return toast.error('คุณไม่มีสิทธิ์ในการบันทึกแม่แบบอีเมล');
    onSave({ branding, events });
    setIsDirty(false);
    toast.success('บันทึกการตั้งค่าและแม่แบบอีเมลเรียบร้อยแล้ว');
  };

  const handleSendTestEmail = async () => {
    const trimmedEmail = String(testRecipient || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return toast.error('กรุณาระบุรูปแบบอีเมลผู้รับทดสอบให้ถูกต้อง (เช่น name@domain.com)');
    }

    try {
      setSendingTest(true);
      await sendTestEmail(trimmedEmail, { ...selectedEvent, event_type: selectedEventKey });
      toast.success(`ส่งอีเมลทดสอบไปยัง ${trimmedEmail} สำเร็จเรียบร้อยแล้ว`);
      setIsTestEmailOpen(false);
    } catch (e) {
      toast.error(e.message || 'เกิดข้อผิดพลาดในการส่งอีเมลทดสอบผ่านเซิร์ฟเวอร์ SMTP');
    } finally {
      setSendingTest(false);
    }
  };

  // Render HTML preview using current selected template and branding (Memoized to prevent forced reflow)
  const currentPreviewHtml = useMemo(() => {
    return renderEmailHtml({
      branding,
      template: selectedEvent,
      data: getSampleEmailData(selectedEventKey)
    });
  }, [branding, selectedEvent, selectedEventKey]);

  // Filtered event keys (Memoized)
  const filteredEventKeys = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    return Object.keys(events).filter(key => {
      const item = events[key];
      if (!item) return false;
      const title = String(item.title || '').toLowerCase();
      const desc = String(item.desc || '').toLowerCase();
      return !q || title.includes(q) || desc.includes(q);
    });
  }, [events, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Global Email Branding Bar */}
      <div className="p-4 rounded-2xl neu-pressed bg-white/40 dark:bg-black/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              การตั้งค่าแบรนด์อีเมลธุรกรรม (Global Email Branding)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              กำหนดโลโก้ สีประจำแบรนด์ และที่อยู่เว็บไซต์หลักสำหรับอีเมลแจ้งเตือนทุกฉบับ
            </p>
          </div>

          {isDirty && (
            <span className="text-xs text-amber-600 font-semibold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1 w-fit">
              <AlertCircle className="w-3.5 h-3.5" />
              มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <Label className="text-[11px] font-semibold">ชื่อระบบที่แสดง (Sender Display Name)</Label>
            <Input
              disabled={!canUpdate}
              value={branding.app_name}
              onChange={(e) => { setBranding(prev => ({ ...prev, app_name: e.target.value })); setIsDirty(true); }}
              placeholder="StockFlow"
              className="mt-1 neu-pressed bg-transparent text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold">URL โลโก้องค์กร (Logo Image URL)</Label>
            <Input
              disabled={!canUpdate}
              value={branding.logo_url}
              onChange={(e) => { setBranding(prev => ({ ...prev, logo_url: e.target.value })); setIsDirty(true); }}
              placeholder="https://domain.com/logo.png"
              className="mt-1 neu-pressed bg-transparent text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold">URL หน้าเว็บหลัก (Public Base URL)</Label>
            <Input
              disabled={!canUpdate}
              value={branding.public_base_url}
              onChange={(e) => { setBranding(prev => ({ ...prev, public_base_url: e.target.value })); setIsDirty(true); }}
              placeholder="https://stockflowth.online"
              className="mt-1 neu-pressed bg-transparent text-xs font-mono"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold">สีประจำแบรนด์ (Accent Color)</Label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                disabled={!canUpdate}
                value={branding.accent_color}
                onChange={(e) => { setBranding(prev => ({ ...prev, accent_color: e.target.value })); setIsDirty(true); }}
                className="h-8 w-10 rounded cursor-pointer border border-border"
              />
              <Input
                disabled={!canUpdate}
                value={branding.accent_color}
                onChange={(e) => { setBranding(prev => ({ ...prev, accent_color: e.target.value })); setIsDirty(true); }}
                className="neu-pressed bg-transparent text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Master-Detail 2-Column Desktop / Stacked Mobile Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Master Event List (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-foreground">เหตุการณ์แจ้งเตือน ({filteredEventKeys.length})</h4>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={handleResetAllEvents}
                className="text-[10px] text-primary hover:underline font-medium"
                title="คืนค่าแม่แบบทั้งหมดเป็นค่าเริ่มต้น"
              >
                รีเซ็ตทั้งหมด
              </button>
            </div>
            <div className="relative w-36">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                placeholder="ค้นหาแม่แบบ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-[11px] h-7 pl-7 neu-pressed bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredEventKeys.map(key => {
              const evt = events[key];
              const isSelected = key === selectedEventKey;
              return (
                <div
                  key={key}
                  onClick={() => setSelectedEventKey(key)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'neu-pressed border-primary/50 bg-primary/5 shadow-sm' 
                      : 'neu-flat hover:neu-pressed border-border/40 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold line-clamp-1 text-foreground">
                      {evt.title}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                      evt.enabled 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' 
                        : 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {evt.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
                    {evt.desc}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-primary" />
                      หลัก: {evt.primary_recipient}
                    </span>
                    <span className="bg-muted/80 px-1.5 py-0.5 rounded text-[10px]">
                      +{evt.roles?.length || 0} บทบาท
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Selected Event Editor & Live Preview (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="neu-flat border-0 overflow-hidden">
            <CardHeader className="py-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  {selectedEvent.title}
                </CardTitle>
                <CardDescription className="text-xs">{selectedEvent.desc}</CardDescription>
              </div>

              {/* Action Buttons: Reset & Enable Switch */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canUpdate}
                  onClick={handleResetCurrentEvent}
                  className="text-xs h-8 px-2.5 flex items-center gap-1 text-muted-foreground hover:text-foreground border-border/60"
                  title="คืนค่าแม่แบบนี้เป็นค่าเริ่มต้นของระบบ"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  คืนค่าเริ่มต้น
                </Button>

                <div className="flex items-center gap-2 bg-background p-1.5 rounded-xl border border-border/50">
                  <span className="text-xs font-medium text-muted-foreground">สถานะ:</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={selectedEvent.enabled}
                      onChange={(e) => handleUpdateSelectedEvent('enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <span className={`text-xs font-bold ${selectedEvent.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {selectedEvent.enabled ? 'เปิดใช้งาน' : 'ปิด'}
                  </span>
                </div>
              </div>
            </CardHeader>

            {/* Sub-Tabs: Content | Recipients | Live Preview | Test Send */}
            <div className="flex border-b border-border/40 bg-muted/20 px-4 pt-2 gap-2 text-xs overflow-x-auto">
              <button
                onClick={() => setActiveTab('content')}
                className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'content'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>ตั้งค่าเนื้อหา (Content)</span>
              </button>

              <button
                onClick={() => setActiveTab('recipients')}
                className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'recipients'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>ผู้รับ & บทบาท (Recipients)</span>
              </button>

              <button
                onClick={() => setActiveTab('preview')}
                className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'preview'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>ตัวอย่างพรีวิว (Live Preview)</span>
              </button>

              <button
                onClick={() => setActiveTab('test')}
                className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'test'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-blue-500" />
                <span>ทดสอบส่งอีเมล (Test)</span>
              </button>
            </div>

            <CardContent className="p-5 space-y-4">
              {/* TAB 1: Content Settings */}
              {activeTab === 'content' && (
                <div className="space-y-4 text-xs">
                  {/* Subject Line & Dynamic Variable Chips */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="tpl_subject" className="font-semibold text-xs">หัวข้ออีเมล (Subject Line)</Label>
                      <span className="text-[10px] text-muted-foreground">คลิกตัวแปรเพื่อแทรกในหัวข้อ</span>
                    </div>

                    <Input
                      id="tpl_subject"
                      disabled={!canUpdate}
                      value={selectedEvent.subject}
                      onChange={(e) => handleUpdateSelectedEvent('subject', e.target.value)}
                      className="neu-pressed bg-transparent font-medium"
                    />

                    {/* Variable Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(SUPPORTED_EVENT_VARIABLES[selectedEventKey] || []).map(v => (
                        <button
                          key={v.code}
                          type="button"
                          disabled={!canUpdate}
                          onClick={() => handleInsertVariable(v.code)}
                          className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-md px-2 py-0.5 text-[10px] font-mono transition-colors flex items-center gap-1"
                          title={v.desc}
                        >
                          <span>{v.code}</span>
                          <span className="text-[9px] text-muted-foreground font-sans">({v.desc})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status Badge & Heading */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="font-semibold text-xs">ข้อความบนป้ายสถานะ (Badge Label)</Label>
                      <Input
                        disabled={!canUpdate}
                        value={selectedEvent.status_label}
                        onChange={(e) => handleUpdateSelectedEvent('status_label', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent"
                      />
                    </div>

                    <div>
                      <Label className="font-semibold text-xs">โทนสีสถานะ (Badge Color Theme)</Label>
                      <select
                        disabled={!canUpdate}
                        value={selectedEvent.status_type}
                        onChange={(e) => handleUpdateSelectedEvent('status_type', e.target.value)}
                        className="w-full mt-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm neu-pressed focus-visible:outline-none"
                      >
                        <option value="warning">สีส้ม / รอดำเนินการ (Amber/Warning)</option>
                        <option value="approved">สีเขียว / สำเร็จ (Emerald/Approved)</option>
                        <option value="rejected">สีแดง / ไม่อนุมัติ (Rose/Rejected)</option>
                        <option value="info">สีน้ำเงิน / ข้อมูล (Blue/Info)</option>
                      </select>
                    </div>

                    <div>
                      <Label className="font-semibold text-xs">หัวข้อหลักของเนื้อหา (Heading)</Label>
                      <Input
                        disabled={!canUpdate}
                        value={selectedEvent.heading}
                        onChange={(e) => handleUpdateSelectedEvent('heading', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Intro Message */}
                  <div>
                    <Label className="font-semibold text-xs">ข้อความเกริ่นนำ (Intro Message)</Label>
                    <textarea
                      disabled={!canUpdate}
                      rows={2}
                      value={selectedEvent.intro}
                      onChange={(e) => handleUpdateSelectedEvent('intro', e.target.value)}
                      className="w-full mt-1 rounded-md border border-input bg-transparent p-2 text-xs shadow-sm neu-pressed focus-visible:outline-none"
                    />
                  </div>

                  {/* CTA Button Label & Link */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="font-semibold text-xs">ข้อความบนปุ่มหลัก (CTA Label)</Label>
                      <Input
                        disabled={!canUpdate}
                        value={selectedEvent.cta_label}
                        onChange={(e) => handleUpdateSelectedEvent('cta_label', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent"
                      />
                    </div>

                    <div>
                      <Label className="font-semibold text-xs">ลิงก์ปลายทางของปุ่ม (CTA Target URL)</Label>
                      <Input
                        disabled={!canUpdate}
                        value={selectedEvent.cta_url}
                        onChange={(e) => handleUpdateSelectedEvent('cta_url', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Footer Note */}
                  <div>
                    <Label className="font-semibold text-xs">ข้อความหมายเหตุด้านล่าง (Footer Note)</Label>
                    <Input
                      disabled={!canUpdate}
                      value={selectedEvent.footer_note}
                      onChange={(e) => handleUpdateSelectedEvent('footer_note', e.target.value)}
                      className="mt-1 neu-pressed bg-transparent"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: Recipients & Routing */}
              {activeTab === 'recipients' && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      ผู้รับอีเมลหลักตามบทบาท (Primary Target)
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      ระบบจะส่งไปยัง <strong className="text-foreground">{selectedEvent.primary_recipient}</strong> ที่เกี่ยวข้องกับรายการโดยอัตโนมัติ
                    </p>
                  </div>

                  {/* Additional Role Checkboxes */}
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs">ส่งสำเนาแจ้งเตือนไปยังกลุ่มบทบาทเพิ่มเติม (CC by Roles):</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {roles.map(r => {
                        const isChecked = (selectedEvent.roles || []).includes(r.code);
                        return (
                          <div
                            key={r.code}
                            onClick={() => canUpdate && handleToggleRole(r.code)}
                            className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                              isChecked 
                                ? 'neu-pressed border-primary/50 bg-primary/10' 
                                : 'neu-flat hover:neu-pressed border-border/50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                            }`}>
                              {isChecked && <Check className="w-3 h-3" />}
                            </div>
                            <span className="font-semibold text-xs text-foreground">{r.name || r.code}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Extra To / CC Emails */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <Label className="font-semibold text-xs">อีเมลรับเพิ่มโดยตรง (To Extra)</Label>
                      <Input
                        disabled={!canUpdate}
                        placeholder="extra1@company.com, extra2@company.com"
                        value={selectedEvent.to_extra || ''}
                        onChange={(e) => handleUpdateSelectedEvent('to_extra', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent font-mono text-[11px]"
                      />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">คั่นหลายอีเมลด้วยเครื่องหมายจุลภาค (,)</span>
                    </div>

                    <div>
                      <Label className="font-semibold text-xs">อีเมลสำเนาเพิ่มโดยตรง (CC Extra)</Label>
                      <Input
                        disabled={!canUpdate}
                        placeholder="manager@company.com, audit@company.com"
                        value={selectedEvent.cc_extra || ''}
                        onChange={(e) => handleUpdateSelectedEvent('cc_extra', e.target.value)}
                        className="mt-1 neu-pressed bg-transparent font-mono text-[11px]"
                      />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">คั่นหลายอีเมลด้วยเครื่องหมายจุลภาค (,)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Live Preview */}
              {activeTab === 'preview' && (
                <div className="space-y-3">
                  {/* Viewport Toolbar */}
                  <div className="flex items-center justify-between bg-muted/40 p-2 rounded-xl border border-border/40">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-primary" />
                      ตัวอย่างการแสดงผลอีเมลจริง (Live HTML Renderer)
                    </span>

                    <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border/50">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 text-[11px] font-medium ${
                          previewDevice === 'desktop' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        Desktop (620px)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 text-[11px] font-medium ${
                          previewDevice === 'mobile' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        Mobile (375px)
                      </button>
                    </div>
                  </div>

                  {/* HTML Email Render Viewport */}
                  <div className="flex justify-center bg-slate-900/10 dark:bg-black/50 p-4 rounded-2xl border border-border/50 min-h-[420px] overflow-auto">
                    <div 
                      className="transition-all duration-300 bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200"
                      style={{ width: previewDevice === 'mobile' ? '375px' : '620px' }}
                    >
                      <iframe
                        title="Email Preview"
                        srcDoc={currentPreviewHtml}
                        className="w-full h-[480px] border-0"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Test Send */}
              {activeTab === 'test' && (
                <div className="space-y-4 text-xs max-w-md mx-auto py-4">
                  <div className="p-4 rounded-2xl neu-pressed text-center space-y-2 bg-blue-500/5 border border-blue-500/20">
                    <Send className="w-8 h-8 text-blue-600 mx-auto" />
                    <h4 className="font-bold text-sm text-foreground">ทดสอบส่งอีเมลแม่แบบนี้ (Send Test Email)</h4>
                    <p className="text-xs text-muted-foreground">
                      ส่งอีเมลทดสอบด้วย HTML Renderer การเรนเดอร์ และข้อมูลตัวอย่างจริงไปยังอีเมลที่คุณระบุ
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="font-semibold text-xs">ระบุอีเมลผู้รับทดสอบ *</Label>
                      <Input
                        type="email"
                        required
                        placeholder="your-email@company.com"
                        value={testRecipient}
                        onChange={(e) => setTestRecipient(e.target.value)}
                        className="mt-1 neu-pressed bg-transparent text-sm"
                      />
                    </div>

                    <Button
                      type="button"
                      disabled={sendingTest || !testRecipient}
                      onClick={handleSendTestEmail}
                      className="w-full neu-primary font-semibold text-xs flex items-center justify-center gap-2 py-2.5"
                    >
                      <Send className="w-4 h-4" />
                      {sendingTest ? 'กำลังส่งอีเมลทดสอบ...' : 'ส่งอีเมลทดสอบทันที'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Global Save Button at bottom of card */}
              {canUpdate && (
                <div className="flex justify-between items-center pt-4 border-t border-border/40">
                  <span className="text-[11px] text-muted-foreground">
                    * การบันทึกจะมีผลบังคับใช้กับระบบส่งแจ้งเตือนอีเมลทันที
                  </span>
                  <Button
                    type="button"
                    onClick={handleSaveAll}
                    className="neu-primary flex items-center gap-2 text-xs font-bold"
                  >
                    <Save className="w-4 h-4" />
                    บันทึกการตั้งค่าและแม่แบบอีเมล
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default EmailTemplateManager;
