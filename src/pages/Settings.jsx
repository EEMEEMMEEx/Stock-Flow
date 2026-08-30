import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Settings as SettingsIcon, AppWindow, Package, Mail, ShieldCheck, 
  Database, Server, Save, ChevronDown, ChevronRight, RefreshCw, Send, Lock, Unlock, Sparkles, AlertTriangle
} from 'lucide-react';
import { APP_CONFIG } from '@/config/appConfig';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EmailTemplateManager from '@/components/settings/EmailTemplateManager';
import DefaultPasswordManager from '@/components/settings/DefaultPasswordManager';
import { sendTestEmail } from '@/lib/emailService';




const Settings = () => {
  const { can, profile } = useAuth();
  const canUpdate = can('settings.update');

  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(null);
  const [roles, setRoles] = useState([]);
  const [systemStats, setSystemStats] = useState({ projects: 0, users: 0, roles: 0 });

  // Open/Close Accordion Sections
  const [openSections, setOpenSections] = useState({
    app: true,
    inventory: true,
    notification: false,
    security: false,
    storage: false,
    system: false
  });

  // Test Email Modal
  const [isTestEmailOpen, setIsTestEmailOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // App Settings State
  const [appForm, setAppForm] = useState({
    app_name: APP_CONFIG.name,
    company_name: '',
    app_subtitle: APP_CONFIG.subtitle
  });

  // Inventory Settings State
  const [inventoryForm, setInventoryForm] = useState({
    low_stock_threshold: 10,
    require_withdrawal_purpose: true,
    allow_inactive_project_view: true,
    allow_item_deletion: true,
    allow_direct_stock_adjustment: false
  });

  // Notification & SMTP State
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 465,
    secure: true,
    reject_unauthorized: true,
    user: '',
    new_password: '',
    sender_email: '',
    sender_name: 'StockFlow Notification',
    password_set: false
  });

  const [notificationEvents, setNotificationEvents] = useState({
    withdrawal_submitted: { enabled: true, roles: ['ADMIN', 'SUPERVISOR'] },
    withdrawal_approved: { enabled: true, roles: ['STAFF'] },
    withdrawal_rejected: { enabled: true, roles: ['STAFF'] },
    withdrawal_completed: { enabled: true, roles: ['ADMIN'] },
    low_stock_alert: { enabled: true, roles: ['ADMIN', 'SUPERVISOR'] }
  });
  const [emailBranding, setEmailBranding] = useState({});

  useEffect(() => {
    fetchInitialSettings();
  }, []);

  const toggleSection = (sectionKey) => {
    setOpenSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const fetchInitialSettings = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchSettingsFromDb(), fetchRolesCatalog(), fetchStats()]);
    } catch (error) {
      console.error('Fetch Settings Error:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูลการตั้งค่า');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettingsFromDb = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_system_settings');
      if (error) {
        console.error('[Settings] Unable to load system settings:', error.code);
        throw error;
      }

      if (data) {
        if (data.app_name !== undefined) {
          setAppForm({
            app_name: data.app_name || APP_CONFIG.name,
            company_name: data.company_name || '',
            app_subtitle: data.app_subtitle || APP_CONFIG.subtitle
          });
        }
        if (data.low_stock_threshold !== undefined || data.allow_item_deletion !== undefined || data.allow_direct_stock_adjustment !== undefined) {
          setInventoryForm({
            low_stock_threshold: Number(data.low_stock_threshold) || 10,
            require_withdrawal_purpose: data.require_withdrawal_purpose ?? true,
            allow_inactive_project_view: data.allow_inactive_project_view ?? true,
            allow_item_deletion: data.allow_item_deletion !== undefined ? Boolean(data.allow_item_deletion) : true,
            allow_direct_stock_adjustment: data.allow_direct_stock_adjustment !== undefined ? Boolean(data.allow_direct_stock_adjustment) : false
          });
        }
        if (data.smtp_config) {
          const rawSmtp = typeof data.smtp_config === 'string'
            ? JSON.parse(data.smtp_config)
            : data.smtp_config;
          setSmtpForm(prev => ({
            ...prev,
            host: rawSmtp.host ?? '',
            port: rawSmtp.port ?? 465,
            secure: rawSmtp.secure !== undefined ? Boolean(rawSmtp.secure) : true,
            reject_unauthorized: rawSmtp.reject_unauthorized !== false,
            user: rawSmtp.user ?? '',
            sender_email: rawSmtp.sender_email ?? '',
            sender_name: rawSmtp.sender_name ?? 'StockFlow Notification',
            password_set: Boolean(rawSmtp.password_set),
            new_password: ''
          }));
        }
        if (data.notification_events) {
          setNotificationEvents(data.notification_events);
        }
        if (data.branding) {
          setEmailBranding(data.branding);
        }
      }
    } catch (e) {
      console.warn('Using fallback settings:', e);
    }
  };

  const fetchRolesCatalog = async () => {
    try {
      const { data } = await supabase.from('roles').select('code, name').eq('is_active', true);
      setRoles(data || [
        { code: 'ADMIN', name: 'ADMINISTRATOR' },
        { code: 'SUPERVISOR', name: 'SUPERVISOR' },
        { code: 'STAFF', name: 'STAFF' }
      ]);
    } catch (e) {
      console.warn('Failed to load roles catalog:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const [{ count: pCount }, { count: uCount }, { count: rCount }] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('roles').select('*', { count: 'exact', head: true })
      ]);
      setSystemStats({
        projects: pCount || 0,
        users: uCount || 0,
        roles: rCount || 0
      });
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
  };

  const handleSaveAppSettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขการตั้งค่า (Requires settings.update)');

    try {
      setSavingCategory('app');
      const payload = {
        app_name: appForm.app_name.trim() || APP_CONFIG.name,
        company_name: appForm.company_name.trim(),
        app_subtitle: appForm.app_subtitle.trim() || APP_CONFIG.subtitle
      };

      const { data, error } = await supabase.rpc('admin_update_system_settings', {
        p_settings: payload,
        p_category: 'application'
      });

      if (error) {
        if (error.code === 'PGRST202' || error.status === 404) {
          toast.error('กรุณารัน Migration 11 ใน Supabase SQL Editor เพื่อใช้งานตารางการตั้งค่า');
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success('บันทึกข้อมูลแอปและ Footer สำเร็จ');
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save App Settings Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSaveInventorySettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขการตั้งค่า (Requires settings.update)');

    try {
      setSavingCategory('inventory');
      const payload = {
        low_stock_threshold: Number(inventoryForm.low_stock_threshold) || 10,
        require_withdrawal_purpose: Boolean(inventoryForm.require_withdrawal_purpose),
        allow_inactive_project_view: Boolean(inventoryForm.allow_inactive_project_view),
        allow_item_deletion: Boolean(inventoryForm.allow_item_deletion),
        allow_direct_stock_adjustment: Boolean(inventoryForm.allow_direct_stock_adjustment)
      };

      const { data, error } = await supabase.rpc('admin_update_system_settings', {
        p_settings: payload,
        p_category: 'inventory'
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('บันทึกกฎการเบิกและสต็อกสำเร็จ');
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save Inventory Settings Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSaveNotificationSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!canUpdate) return toast.error('คุณไม่มีสิทธิ์ในการแก้ไขการตั้งค่า (Requires settings.update)');

    try {
      setSavingCategory('notification');
      
      const smtpPayload = {
        host: String(smtpForm.host || '').trim(),
        port: Number(smtpForm.port) || 465,
        secure: Boolean(smtpForm.secure),
        reject_unauthorized: smtpForm.reject_unauthorized !== false,
        user: String(smtpForm.user || '').trim(),
        sender_email: String(smtpForm.sender_email || '').trim(),
        sender_name: String(smtpForm.sender_name || '').trim() || 'StockFlow Notification',
        password_set: Boolean(smtpForm.password_set || (smtpForm.new_password && smtpForm.new_password.trim()))
      };

      const payload = {
        smtp_config: smtpPayload,
        notification_events: notificationEvents
      };

      const { data, error } = await supabase.rpc('admin_update_system_settings', {
        p_settings: payload,
        p_category: 'notifications'
      });

      if (error) throw error;

      // Save password to Vault RPC if provided
      if (smtpForm.new_password && smtpForm.new_password.trim()) {
        const { error: vaultErr } = await supabase.rpc('admin_update_smtp_password', {
          p_password: smtpForm.new_password.trim()
        });
        if (vaultErr) console.warn('[Settings] SMTP Password Vault Error:', vaultErr.message);
      }

      toast.success('บันทึกการตั้งค่าการแจ้งเตือนสำเร็จ');
      setSmtpForm(prev => ({
        ...prev,
        ...smtpPayload,
        new_password: ''
      }));

      // Re-fetch to ensure sync with database
      await fetchSettingsFromDb();
    } catch (error) {
      console.error('Save Notification Settings Error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSendTestEmail = async () => {
    const trimmedEmail = String(testEmailRecipient || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      toast.error('กรุณาระบุรูปแบบอีเมลผู้รับทดสอบให้ถูกต้อง (เช่น name@domain.com)');
      return;
    }

    try {
      setSendingTestEmail(true);

      const customSmtpOverrides = {
        host: String(smtpForm.host || '').trim(),
        port: Number(smtpForm.port) || 465,
        secure: Boolean(smtpForm.secure),
        reject_unauthorized: smtpForm.reject_unauthorized !== false,
        user: String(smtpForm.user || '').trim(),
        sender_email: String(smtpForm.sender_email || '').trim(),
        sender_name: String(smtpForm.sender_name || '').trim() || 'StockFlow Notification'
      };

      if (smtpForm.new_password && smtpForm.new_password.trim()) {
        customSmtpOverrides.pass = smtpForm.new_password.trim();
      }

      await sendTestEmail(trimmedEmail, null, customSmtpOverrides);
      toast.success(`ส่งอีเมลทดสอบไปยัง ${trimmedEmail} สำเร็จเรียบร้อยแล้ว`);
      setIsTestEmailOpen(false);
      setTestEmailRecipient('');
    } catch (e) {
      toast.error(e.message || 'เกิดข้อผิดพลาดในการส่งอีเมลทดสอบ');
    } finally {
      setSendingTestEmail(false);
    }
  };



  const toggleEventRole = (eventKey, roleCode) => {
    setNotificationEvents(prev => {
      const currentRoles = prev[eventKey]?.roles || [];
      const exists = currentRoles.includes(roleCode);
      const updatedRoles = exists
        ? currentRoles.filter(r => r !== roleCode)
        : [...currentRoles, roleCode];

      return {
        ...prev,
        [eventKey]: {
          ...prev[eventKey],
          roles: updatedRoles
        }
      };
    });
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-primary" />
            ตั้งค่าระบบ (System Settings)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            จัดการข้อมูลระบบ กฎการทำงาน การแจ้งเตือน และการตั้งค่าระดับแอปพลิเคชัน
          </p>
        </div>

        <Button 
          variant="outline" 
          onClick={fetchInitialSettings} 
          disabled={loading}
          className="neu-button flex items-center gap-2 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรชค่าการตั้งค่า
        </Button>
      </div>

      {/* Read-only permission notice */}
      {!canUpdate && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center gap-2 text-xs">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>บัญชีของคุณมีสิทธิ์ดูข้อมูลการตั้งค่าเท่านั้น (Requires <code className="font-mono bg-amber-200/50 px-1 rounded">settings.update</code> to save changes)</span>
        </div>
      )}

      {/* SECTION 1: Application & Footer Settings */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('app')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <AppWindow className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold">1. ข้อมูลแอปและ Footer (Application & Footer)</CardTitle>
              <CardDescription className="text-xs">ชื่อระบบ องค์กร คำอธิบาย และการแสดงผลส่วนท้ายกระดาษ</CardDescription>
            </div>
          </div>
          {openSections.app ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.app && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40">
            <form onSubmit={handleSaveAppSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="app_name" className="text-xs font-semibold">ชื่อแอปพลิเคชัน (Application Name)</Label>
                  <Input
                    id="app_name"
                    required
                    disabled={!canUpdate}
                    value={appForm.app_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, app_name: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="company_name" className="text-xs font-semibold">ชื่อบริษัท / องค์กร (Company / Organization)</Label>
                  <Input
                    id="company_name"
                    disabled={!canUpdate}
                    placeholder="เช่น Forth Co., Ltd. (ระบุหรือไม่ก็ได้)"
                    value={appForm.company_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, company_name: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="app_subtitle" className="text-xs font-semibold">คำอธิบายระบบส่วนย่อย (Application Subtitle)</Label>
                <Input
                  id="app_subtitle"
                  disabled={!canUpdate}
                  value={appForm.app_subtitle}
                  onChange={(e) => setAppForm(prev => ({ ...prev, app_subtitle: e.target.value }))}
                  className="mt-1 neu-pressed bg-transparent text-xs"
                />
              </div>

              {/* Version & Build Info (Read-only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">เวอร์ชันระบบ (Application Version - Build Metadata)</Label>
                  <Input
                    disabled
                    value={`v${APP_CONFIG.version}`}
                    className="mt-1 neu-pressed bg-muted/40 text-muted-foreground font-mono text-xs cursor-not-allowed"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">สภาพแวดล้อม (Environment)</Label>
                  <Input
                    disabled
                    value={import.meta.env.MODE || 'production'}
                    className="mt-1 neu-pressed bg-muted/40 text-muted-foreground font-mono text-xs uppercase cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3.5 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ตัวอย่างการแสดงผลส่วนท้ายกระดาษจริง (Live Footer Preview):</span>
                </div>
                <div className="p-2.5 rounded-lg bg-background border border-border/50 text-xs text-muted-foreground flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">© {APP_CONFIG.year} {appForm.app_name || APP_CONFIG.name}</span>
                    <span>•</span>
                    <span className="text-[11px]">{appForm.app_subtitle || APP_CONFIG.subtitle}</span>
                    {appForm.company_name && (
                      <>
                        <span>•</span>
                        <span className="text-[11px] font-medium text-foreground/80">{appForm.company_name}</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">v{APP_CONFIG.version}</span>
                </div>
              </div>

              {canUpdate && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingCategory === 'app'} className="neu-primary flex items-center gap-2 text-xs font-semibold">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'app' ? 'กำลังบันทึก...' : 'บันทึกข้อมูลแอปและ Footer'}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* SECTION 2: Inventory & Withdrawal Rules */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('inventory')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-amber-600" />
            <div>
              <CardTitle className="text-base font-bold">2. กฎการเบิกและสต็อก (Inventory & Withdrawal Rules)</CardTitle>
              <CardDescription className="text-xs">กำหนดเกณฑ์เตือนสต็อกต่ำ วัตถุประสงค์การเบิก และนโยบายธุรกรรม</CardDescription>
            </div>
          </div>
          {openSections.inventory ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.inventory && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40">
            <form onSubmit={handleSaveInventorySettings} className="space-y-4">
              {/* Read-only Approval Policy Alert */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  นโยบายการอนุมัติ: All-or-Nothing (บังคับใช้โดยระบบเพื่อป้องกันสต็อกติดลบ)
                </span>
                <p className="text-[11px] leading-relaxed opacity-90 pl-5.5">
                  ระบบ StockFlow บังคับใช้การอนุมัติแบบ Transaction เดียวกันทั้งบิล หากสินค้าชิ้นใดชิ้นหนึ่งในคำขอเบิกมีสต็อกไม่พอ ผู้อนุมัติจะไม่สามารถตัดสต็อกบางส่วนได้และต้องกดปฏิเสธทั้งบิล เพื่อความถูกต้องสมบูรณ์ของคลังสินค้า
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="low_stock_threshold" className="text-xs font-semibold">เกณฑ์สต็อกต่ำเริ่มต้น (Default Low Stock Threshold)</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    min="0"
                    disabled={!canUpdate}
                    value={inventoryForm.low_stock_threshold}
                    onChange={(e) => setInventoryForm(prev => ({ ...prev, low_stock_threshold: e.target.value }))}
                    className="mt-1 neu-pressed bg-transparent text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    * เมื่อจำนวนวัสดุเหลือต่ำกว่าเกณฑ์นี้ ระบบจะขึ้นป้ายเตือน &quot;สินค้าใกล้หมด&quot; ในหน้าคลัง
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.require_withdrawal_purpose}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, require_withdrawal_purpose: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>บังคับระบุวัตถุประสงค์ในการขอเบิกจ่ายทุกครั้ง</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_inactive_project_view}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_inactive_project_view: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>อนุญาตให้ผู้ใช้เข้าดูประวัติและยอดยกมาจากโครงการที่ปิดตัวลงแล้ว (Inactive Projects)</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_item_deletion}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_item_deletion: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>อนุญาตให้แสดงปุ่มลบรายการวัสดุ (Enable Item Deletion Button)</span>
                  </label>

                  <div className="space-y-1.5 pt-1 border-t border-border/40">
                    <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canUpdate}
                        checked={inventoryForm.allow_direct_stock_adjustment}
                        onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_direct_stock_adjustment: e.target.checked }))}
                        className="rounded text-primary focus:ring-primary h-4 w-4"
                      />
                      <span>อนุญาตให้แก้ไขยอดสต็อกคงเหลือปัจจุบันในหน้า Master Items (Enable Current Stock Editing)</span>
                    </label>
                    <div className="pl-6.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl">
                      <strong>คำแนะนำ/Warning:</strong> “Adjust the current stock before enabling Current Stock Editing.” (ปรับยอดสต็อกปัจจุบันก่อนเปิดใช้งานการแก้ไขสต็อกโดยตรง)
                    </div>
                  </div>
                </div>
              </div>

              {canUpdate && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingCategory === 'inventory'} className="neu-primary flex items-center gap-2 text-xs font-semibold">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'inventory' ? 'กำลังบันทึก...' : 'บันทึกกฎการเบิกและสต็อก'}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* SECTION 3: Notification & Email Settings */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('notification')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle className="text-base font-bold">3. การแจ้งเตือนและอีเมล (Notification & Email Settings)</CardTitle>
              <CardDescription className="text-xs">ตั้งค่าเซิร์ฟเวอร์ SMTP และบทบาทที่จะรับการแจ้งเตือนตามเหตุการณ์</CardDescription>
            </div>
          </div>
          {openSections.notification ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.notification && (
          <CardContent className="pt-2 pb-6 space-y-5 border-t border-border/40">
            <form onSubmit={handleSaveNotificationSettings} className="space-y-5">
              {/* SMTP Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground">การตั้งค่าเซิร์ฟเวอร์ส่งอีเมล (SMTP Server Configuration)</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTestEmailOpen(true)}
                    className="neu-button text-xs h-7 px-2.5 flex items-center gap-1 text-blue-600"
                  >
                    <Send className="w-3 h-3" />
                    ทดสอบส่งอีเมล (Test Email)
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="smtp_host" className="text-[11px] font-semibold">SMTP Host</Label>
                    <Input
                      id="smtp_host"
                      disabled={!canUpdate}
                      placeholder="smtp.gmail.com"
                      value={smtpForm.host ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, host: e.target.value }))}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="smtp_port" className="text-[11px] font-semibold">SMTP Port</Label>
                    <Input
                      id="smtp_port"
                      type="number"
                      disabled={!canUpdate}
                      placeholder="465"
                      value={smtpForm.port ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numVal = Number(val);
                        setSmtpForm(prev => ({
                          ...prev,
                          port: val,
                          secure: numVal === 465 ? true : (numVal === 587 || numVal === 25 ? false : prev.secure)
                        }));
                      }}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="smtp_user" className="text-[11px] font-semibold">SMTP Username</Label>
                    <Input
                      id="smtp_user"
                      autoComplete="username"
                      disabled={!canUpdate}
                      placeholder="user@example.com"
                      value={smtpForm.user ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, user: e.target.value }))}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="sender_email" className="text-[11px] font-semibold">อีเมลผู้ส่ง (Sender Email)</Label>
                    <Input
                      id="sender_email"
                      autoComplete="email"
                      disabled={!canUpdate}
                      placeholder="noreply@stockflow.com"
                      value={smtpForm.sender_email ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, sender_email: e.target.value }))}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sender_name" className="text-[11px] font-semibold">ชื่อผู้ส่ง (Sender Name)</Label>
                    <Input
                      id="sender_name"
                      autoComplete="off"
                      disabled={!canUpdate}
                      value={smtpForm.sender_name ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, sender_name: e.target.value }))}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>

                  <div>
                    <Label htmlFor="smtp_pw" className="text-[11px] font-semibold">
                      SMTP Password {smtpForm.password_set && <span className="text-emerald-600 font-bold ml-1">(ตั้งค่าไว้แล้ว)</span>}
                    </Label>
                    <Input
                      id="smtp_pw"
                      type="password"
                      autoComplete="new-password"
                      disabled={!canUpdate}
                      placeholder={smtpForm.password_set ? '•••••••• (ระบุใหม่เมื่อต้องการเปลี่ยน)' : 'ระบุรหัสผ่าน SMTP'}
                      value={smtpForm.new_password ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, new_password: e.target.value }))}
                      className="mt-1 neu-pressed bg-transparent text-xs"
                    />
                  </div>
                </div>

                {/* Security Protocol & Certificate Verification Section */}
                <div className="p-3.5 rounded-xl neu-pressed bg-white/40 dark:bg-black/20 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="smtp_secure" className="text-[11px] font-semibold flex items-center gap-1.5 text-foreground">
                        <Lock className="w-3.5 h-3.5 text-primary" />
                        การเชื่อมต่อความปลอดภัย (Security Protocol)
                      </Label>
                      <select
                        id="smtp_secure"
                        disabled={!canUpdate}
                        value={smtpForm.secure ? 'true' : 'false'}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, secure: e.target.value === 'true' }))}
                        className="mt-1.5 w-full rounded-md border border-input bg-background/80 px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="true">SSL/TLS แบบเข้ารหัสทันที (Port 465 — Implicit TLS)</option>
                        <option value="false">STARTTLS (Port 587 / 25 — อัปเกรดความปลอดภัยก่อนส่ง)</option>
                      </select>
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1.5">
                        {smtpForm.secure ? (
                          <>
                            <Lock className="w-3 h-3 text-emerald-600 inline shrink-0" />
                            <span>Implicit TLS: เข้ารหัสซ็อกเก็ตตั้งแต่เริ่มเปิดการเชื่อมต่อไปยัง SMTP Server (แนะนำสำหรับพอร์ต 465)</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 text-amber-600 inline shrink-0" />
                            <span>STARTTLS: เริ่มเชื่อมต่อแบบปกติแล้วอัปเกรดเป็น TLS ก่อนส่งข้อมูล (แนะนำสำหรับพอร์ต 587/25)</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold flex items-center gap-1.5 text-foreground">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        การตรวจสอบใบรับรอง TLS (Verify TLS Certificate)
                      </Label>
                      <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="reject_unauthorized"
                          disabled={!canUpdate}
                          checked={smtpForm.reject_unauthorized !== false}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, reject_unauthorized: e.target.checked }))}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                        />
                        <span className="text-xs font-medium">ตรวจสอบว่าใบรับรองออกโดย CA ที่เชื่อถือได้</span>
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        แนะนำเปิดใช้งานเสมอ หากปิดจะอนุญาตใบรับรอง Self-Signed ภายในองค์กร
                      </p>
                    </div>
                  </div>

                  {/* Port / Security Mismatch Warning Banners */}
                  {Number(smtpForm.port) === 465 && !smtpForm.secure && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>คำเตือน: พอร์ต 465 โดยทั่วไปต้องใช้ SSL/TLS แบบเข้ารหัสทันที (secure = true) การเลือก STARTTLS บนพอร์ต 465 อาจทำให้ซ็อกเก็ตหมดเวลา (ETIMEDOUT)</span>
                    </div>
                  )}

                  {Number(smtpForm.port) === 587 && smtpForm.secure && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>คำเตือน: พอร์ต 587 โดยทั่วไปต้องใช้ STARTTLS (secure = false) การเลือก SSL/TLS แบบเข้ารหัสทันทีบนพอร์ต 587 อาจทำให้เกิดข้อผิดพลาด Greeting never received</span>
                    </div>
                  )}

                  {smtpForm.reject_unauthorized === false && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>คำเตือนความปลอดภัย: ปิดการตรวจสอบใบรับรอง TLS เฉพาะกรณีที่ SMTP Server ใช้ Self-Signed Certificate หรือ CA ภายในองค์กรที่เครื่องนี้ไม่รู้จักเท่านั้น</span>
                    </div>
                  )}

                  {/* Effective Configuration Summary */}
                  <div className="pt-2 border-t border-border/20 flex flex-wrap items-center justify-between text-[11px] text-muted-foreground gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">คอนฟิกที่มีผล:</span>
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px]">
                        {smtpForm.host || 'smtp.gmail.com'}:{smtpForm.port || 465}
                      </span>
                      {smtpForm.sender_email && (
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-mono text-[10px]">
                          Sender: {smtpForm.sender_email}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono text-[10px]">
                        {smtpForm.secure ? 'Implicit SSL/TLS' : 'STARTTLS'}
                      </span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${smtpForm.reject_unauthorized !== false ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                        TLS Cert Check: {smtpForm.reject_unauthorized !== false ? 'VERIFIED' : 'DISABLED'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>


              {canUpdate && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingCategory === 'notification'} className="neu-primary flex items-center gap-2 text-xs font-semibold">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'notification' ? 'กำลังบันทึก...' : 'บันทึกเซิร์ฟเวอร์ SMTP'}
                  </Button>
                </div>
              )}
            </form>

            {/* Email Template Manager Component */}
            <div className="pt-4 border-t border-border/40">
              <EmailTemplateManager
                eventsConfig={notificationEvents}
                brandingConfig={emailBranding}
                roles={roles}
                canUpdate={canUpdate}
                onSave={async ({ branding, events }) => {
                  try {
                    const payload = {
                      branding,
                      notification_events: events
                    };
                    const { data, error } = await supabase.rpc('admin_update_system_settings', {
                      p_settings: payload,
                      p_category: 'email_templates'
                    });
                    if (error) throw error;
                    if (data?.success) {
                      setNotificationEvents(events);
                      setEmailBranding(branding);
                    }
                  } catch (err) {
                    console.error('Save Email Templates Error:', err);
                    toast.error('เกิดข้อผิดพลาดในการบันทึกแม่แบบอีเมล');
                  }
                }}
              />
            </div>
          </CardContent>
        )}
      </Card>


      {/* SECTION 4: User & Security Policy */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('security')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <div>
              <CardTitle className="text-base font-bold">4. ผู้ใช้และความปลอดภัย (User & Security Policy)</CardTitle>
              <CardDescription className="text-xs">นโยบายรหัสผ่าน การจัดการบัญชี และความปลอดภัยระดับแอปพลิเคชัน</CardDescription>
            </div>
          </div>
          {openSections.security ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.security && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40 text-xs">
            {/* Default Reset Password Manager */}
            <DefaultPasswordManager canUpdate={canUpdate} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl neu-pressed-sm space-y-2 bg-white/40 dark:bg-black/20">
                <span className="font-bold text-foreground block text-sm">นโยบายรหัสผ่านผู้ใช้งาน (Password Policy)</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร พิมพ์ใหญ่, พิมพ์เล็ก, ตัวเลข, อักขระพิเศษ</li>
                  <li>มีระบบสุ่มรหัสผ่านปลอดภัยชั่วคราว (Set Random Default) ในหน้าตั้งค่า</li>
                  <li><strong className="text-foreground">การจัดเก็บรหัสผ่านอย่างปลอดภัย (Secure Vault):</strong> รหัสผ่านถูกจัดเก็บฝั่งเซิร์ฟเวอร์แบบลับ และไม่ส่งคืนไปยัง Client หรือแสดงบนหน้าจอทุกกรณี</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl neu-pressed-sm space-y-2 bg-white/40 dark:bg-black/20">
                <span className="font-bold text-foreground block text-sm">การคุ้มครองบัญชีผู้ใช้และการลบข้อมูล (User Account Lifecycle)</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong className="text-foreground font-semibold">แนะนำใช้วิธี Inactive:</strong> บัญชีที่มีประวัติเบิกจ่ายควรใช้วิธีเปลี่ยนสถานะเป็น Inactive แทนการลบ</li>
                  <li><strong className="text-purple-600 font-bold">Last Admin Protection:</strong> ป้องกันการลบ หรือปลดสิทธิ์ Admin คนสุดท้ายของระบบทั้งฝั่ง Client และ Database Triggers</li>
                </ul>
              </div>
            </div>
          </CardContent>
        )}

      </Card>

      {/* SECTION 5: Storage Status */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('storage')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-600" />
            <div>
              <CardTitle className="text-base font-bold">5. สถานะการจัดเก็บข้อมูล (Storage Status)</CardTitle>
              <CardDescription className="text-xs">สถานะของ Cloudflare R2 Object Storage และนโยบายการจัดเก็บไฟล์ภาพ</CardDescription>
            </div>
          </div>
          {openSections.storage ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.storage && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl neu-pressed-sm space-y-1">
                <span className="text-muted-foreground text-[11px] block">Provider</span>
                <span className="font-bold text-sm text-foreground">Cloudflare R2 (S3 API)</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm space-y-1">
                <span className="text-muted-foreground text-[11px] block">Bucket ชื่อ</span>
                <span className="font-bold text-sm text-primary font-mono">stockflow-assets</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm space-y-1">
                <span className="text-muted-foreground text-[11px] block">ขนาดไฟล์สูงสุด</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">5 MB (JPG / PNG / WebP)</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* SECTION 6: System Information */}
      <Card className="neu-flat border-0 overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('system')}
          className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <div>
              <CardTitle className="text-base font-bold">6. ข้อมูลระบบ (System Information)</CardTitle>
              <CardDescription className="text-xs">สรุปสถิติเวอร์ชัน สภาพแวดล้อม และสถานะการเชื่อมต่อฐานข้อมูล</CardDescription>
            </div>
          </div>
          {openSections.system ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>


        {openSections.system && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">เวอร์ชัน</span>
                <span className="font-mono font-bold text-xs text-primary">v{APP_CONFIG.version}</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">สภาพแวดล้อม</span>
                <span className="font-mono font-bold text-xs uppercase">{import.meta.env.MODE || 'production'}</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">ฐานข้อมูล</span>
                <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">Connected</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">จำนวนโครงการ</span>
                <span className="font-bold text-xs text-foreground">{systemStats.projects} โครงการ</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">จำนวนผู้ใช้</span>
                <span className="font-bold text-xs text-foreground">{systemStats.users} บัญชี</span>
              </div>

              <div className="p-3 rounded-xl neu-pressed-sm">
                <span className="text-[10px] text-muted-foreground block">จำนวนบทบาท</span>
                <span className="font-bold text-xs text-purple-600 dark:text-purple-400">{systemStats.roles} บทบาท</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Test Email Modal */}
      <Dialog open={isTestEmailOpen} onOpenChange={setIsTestEmailOpen}>
        <DialogContent className="max-w-md neu-flat border-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-blue-600">
              <Send className="w-5 h-5" />
              ทดสอบส่งอีเมล (Test Email Notification)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              ทดสอบส่งข้อความแจ้งเตือนผ่านระบบการส่งอีเมล SMTP ของแอปพลิเคชัน
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div>
              <Label htmlFor="test_recipient" className="text-xs font-semibold">อีเมลผู้รับทดสอบ *</Label>
              <Input
                id="test_recipient"
                type="email"
                required
                placeholder="target@company.com"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                className="mt-1 neu-pressed bg-transparent text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsTestEmailOpen(false)}>
              ยกเลิก
            </Button>
            <Button 
              disabled={sendingTestEmail || !testEmailRecipient} 
              onClick={handleSendTestEmail}
              className="neu-primary text-xs font-semibold"
            >
              {sendingTestEmail ? 'กำลังส่ง...' : 'ส่งอีเมลทดสอบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
