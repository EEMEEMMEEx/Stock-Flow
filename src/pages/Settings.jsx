import { useState, useEffect, useCallback } from 'react';
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
  const { can } = useAuth();
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

  const toggleSection = (sectionKey) => {
    setOpenSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const fetchSettingsFromDb = useCallback(async () => {
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
  }, []);

  const fetchRolesCatalog = useCallback(async () => {
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
  }, []);

  const fetchStats = useCallback(async () => {
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
  }, []);

  const fetchInitialSettings = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchSettingsFromDb(), fetchRolesCatalog(), fetchStats()]);
    } catch (error) {
      console.error('Fetch Settings Error:', error);
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  }, [fetchSettingsFromDb, fetchRolesCatalog, fetchStats]);

  useEffect(() => {
    fetchInitialSettings();
  }, [fetchInitialSettings]);

  const handleSaveAppSettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error('Permission denied. Requires settings.update');

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
          toast.error('Please run Migration 11 in Supabase SQL Editor to enable settings table');
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success('Application and footer settings saved successfully');
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save App Settings Error:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSaveInventorySettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error('Permission denied. Requires settings.update');

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
        toast.success('Inventory and withdrawal rules saved successfully');
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save Inventory Settings Error:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSaveNotificationSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!canUpdate) return toast.error('Permission denied. Requires settings.update');

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

      const { error } = await supabase.rpc('admin_update_system_settings', {
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

      toast.success('Notification settings saved successfully');
      setSmtpForm(prev => ({
        ...prev,
        ...smtpPayload,
        new_password: ''
      }));

      // Re-fetch to ensure sync with database
      await fetchSettingsFromDb();
    } catch (error) {
      console.error('Save Notification Settings Error:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSendTestEmail = async () => {
    const trimmedEmail = String(testEmailRecipient || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      toast.error('Please enter a valid recipient email (e.g., name@domain.com)');
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
      toast.success(`Test email sent to ${trimmedEmail} successfully`);
      setIsTestEmailOpen(false);
      setTestEmailRecipient('');
    } catch (e) {
      toast.error(e.message || 'Failed to send test email');
    } finally {
      setSendingTestEmail(false);
    }
  };



  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-primary" />
            System Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage system information, operating rules, notifications, and application settings
          </p>
        </div>

        <Button 
          variant="outline" 
          onClick={fetchInitialSettings} 
          disabled={loading}
          className="h-9 rounded-lg font-semibold flex items-center gap-2 text-xs cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Settings
        </Button>
      </div>

      {/* Read-only permission notice */}
      {!canUpdate && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center gap-2 text-xs">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Your account has read-only access to settings (Requires <code className="font-mono bg-amber-200/50 px-1 rounded">settings.update</code> to save changes)</span>
        </div>
      )}

      {/* SECTION 1: Application & Footer Settings */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('app')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <AppWindow className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold">1. Application & Footer</CardTitle>
              <CardDescription className="text-xs">System name, organization, description, and footer display</CardDescription>
            </div>
          </div>
          {openSections.app ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.app && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40">
            <form onSubmit={handleSaveAppSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="app_name" className="text-xs font-semibold">Application Name</Label>
                  <Input
                    id="app_name"
                    required
                    disabled={!canUpdate}
                    value={appForm.app_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, app_name: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>

                <div>
                  <Label htmlFor="company_name" className="text-xs font-semibold">Company / Organization</Label>
                  <Input
                    id="company_name"
                    disabled={!canUpdate}
                    placeholder="e.g. Forth Co., Ltd. (optional)"
                    value={appForm.company_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, company_name: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="app_subtitle" className="text-xs font-semibold">Application Subtitle</Label>
                <Input
                  id="app_subtitle"
                  disabled={!canUpdate}
                  value={appForm.app_subtitle}
                  onChange={(e) => setAppForm(prev => ({ ...prev, app_subtitle: e.target.value }))}
                  className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                />
              </div>

              {/* Version & Build Info (Read-only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Application Version (Build Metadata)</Label>
                  <Input
                    disabled
                    value={`v${APP_CONFIG.version}`}
                    className="mt-1 h-9 text-xs rounded-lg bg-muted/40 text-muted-foreground font-mono cursor-not-allowed border border-input"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Environment</Label>
                  <Input
                    disabled
                    value={import.meta.env.MODE || 'production'}
                    className="mt-1 h-9 text-xs rounded-lg bg-muted/40 text-muted-foreground font-mono uppercase cursor-not-allowed border border-input"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Live Footer Preview:</span>
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
                  <Button type="submit" disabled={savingCategory === 'app'} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-xs font-semibold cursor-pointer shadow-xs">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'app' ? 'Saving...' : 'Save App & Footer Settings'}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* SECTION 2: Inventory & Withdrawal Rules */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('inventory')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-amber-600" />
            <div>
              <CardTitle className="text-base font-bold">2. Inventory & Withdrawal Rules</CardTitle>
              <CardDescription className="text-xs">Configure low-stock threshold, withdrawal purpose requirements, and transaction policies</CardDescription>
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
                  Approval Policy: All-or-Nothing (Enforced by system to prevent negative stock)
                </span>
                <p className="text-[11px] leading-relaxed opacity-90 pl-5.5">
                  StockFlow enforces atomic all-or-nothing approvals. If any requested item lacks sufficient stock, approvers cannot partially fulfill the order and must reject the entire request to maintain inventory integrity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="low_stock_threshold" className="text-xs font-semibold">Default Low Stock Threshold</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    min="0"
                    disabled={!canUpdate}
                    value={inventoryForm.low_stock_threshold}
                    onChange={(e) => setInventoryForm(prev => ({ ...prev, low_stock_threshold: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    * When inventory falls below this threshold, items display a &quot;Low Stock&quot; badge in inventory
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
                    <span>Require purpose for all withdrawal requests</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_inactive_project_view}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_inactive_project_view: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Allow users to view history and balances from inactive projects</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_item_deletion}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_item_deletion: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Enable Item Deletion Button</span>
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
                      <span>Enable Current Stock Editing on Master Items</span>
                    </label>
                    <div className="pl-6.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                      <strong>Warning:</strong> Adjust physical stock before enabling direct stock editing.
                    </div>
                  </div>
                </div>
              </div>

              {canUpdate && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingCategory === 'inventory'} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-xs font-semibold cursor-pointer shadow-xs">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'inventory' ? 'Saving...' : 'Save Inventory Rules'}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* SECTION 3: Notification & Email Settings */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('notification')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle className="text-base font-bold">3. Notification & Email Settings</CardTitle>
              <CardDescription className="text-xs">Configure SMTP server and recipient roles for event-based notifications</CardDescription>
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
                  <h4 className="text-xs font-bold text-foreground">SMTP Server Configuration</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTestEmailOpen(true)}
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-blue-600 border-border hover:bg-accent cursor-pointer shadow-xs"
                  >
                    <Send className="w-3 h-3" />
                    Test Email
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
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
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
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
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
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="sender_email" className="text-[11px] font-semibold">Sender Email</Label>
                    <Input
                      id="sender_email"
                      autoComplete="email"
                      disabled={!canUpdate}
                      placeholder="noreply@stockflow.com"
                      value={smtpForm.sender_email ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, sender_email: e.target.value }))}
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sender_name" className="text-[11px] font-semibold">Sender Name</Label>
                    <Input
                      id="sender_name"
                      autoComplete="off"
                      disabled={!canUpdate}
                      value={smtpForm.sender_name ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, sender_name: e.target.value }))}
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                    />
                  </div>

                  <div>
                    <Label htmlFor="smtp_pw" className="text-[11px] font-semibold">
                      SMTP Password {smtpForm.password_set && <span className="text-emerald-600 font-bold ml-1">(Configured)</span>}
                    </Label>
                    <Input
                      id="smtp_pw"
                      type="password"
                      autoComplete="new-password"
                      disabled={!canUpdate}
                      placeholder={smtpForm.password_set ? '•••••••• (Enter new to change)' : 'Enter SMTP password'}
                      value={smtpForm.new_password ?? ''}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, new_password: e.target.value }))}
                      className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                    />
                  </div>
                </div>

                {/* Security Protocol & Certificate Verification Section */}
                <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="smtp_secure" className="text-[11px] font-semibold flex items-center gap-1.5 text-foreground">
                        <Lock className="w-3.5 h-3.5 text-primary" />
                        Security Protocol
                      </Label>
                      <select
                        id="smtp_secure"
                        disabled={!canUpdate}
                        value={smtpForm.secure ? 'true' : 'false'}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, secure: e.target.value === 'true' }))}
                        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="true">Implicit SSL/TLS (Port 465)</option>
                        <option value="false">STARTTLS (Port 587 / 25)</option>
                      </select>
                      <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1.5">
                        {smtpForm.secure ? (
                          <>
                            <Lock className="w-3 h-3 text-emerald-600 inline shrink-0" />
                            <span>Implicit TLS: Encrypts socket immediately upon connection to SMTP server (recommended for Port 465)</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 text-amber-600 inline shrink-0" />
                            <span>STARTTLS: Connects normally then upgrades to TLS before sending data (recommended for Port 587/25)</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold flex items-center gap-1.5 text-foreground">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Verify TLS Certificate
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
                        <span className="text-xs font-medium">Verify certificate is issued by a trusted CA</span>
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        Always recommended. Disabling allows internal self-signed certificates
                      </p>
                    </div>
                  </div>

                  {/* Port / Security Mismatch Warning Banners */}
                  {Number(smtpForm.port) === 465 && !smtpForm.secure && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>Warning: Port 465 typically requires implicit SSL/TLS (secure = true). Selecting STARTTLS on port 465 may cause socket timeouts (ETIMEDOUT)</span>
                    </div>
                  )}

                  {Number(smtpForm.port) === 587 && smtpForm.secure && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>Warning: Port 587 typically requires STARTTLS (secure = false). Selecting implicit SSL/TLS on port 587 may cause &apos;Greeting never received&apos; errors</span>
                    </div>
                  )}

                  {smtpForm.reject_unauthorized === false && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>Security Warning: Only disable TLS certificate verification if your SMTP server uses a self-signed certificate or custom internal CA</span>
                    </div>
                  )}

                  {/* Effective Configuration Summary */}
                  <div className="pt-2 border-t border-border/20 flex flex-wrap items-center justify-between text-[11px] text-muted-foreground gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">Active Config:</span>
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
                  <Button type="submit" disabled={savingCategory === 'notification'} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-xs font-semibold cursor-pointer shadow-xs">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'notification' ? 'Saving...' : 'Save SMTP Settings'}
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
                    toast.error('Failed to save email templates');
                  }
                }}
              />
            </div>
          </CardContent>
        )}
      </Card>


      {/* SECTION 4: User & Security Policy */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('security')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <div>
              <CardTitle className="text-base font-bold">4. User & Security Policy</CardTitle>
              <CardDescription className="text-xs">Password policy, user account management, and application-level security</CardDescription>
            </div>
          </div>
          {openSections.security ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.security && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40 text-xs">
            {/* Default Reset Password Manager */}
            <DefaultPasswordManager canUpdate={canUpdate} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <span className="font-bold text-foreground block text-sm">Password Policy</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Passwords must be at least 12 characters and include uppercase, lowercase, numbers, and special characters</li>
                  <li>Support for generating secure temporary passwords (Set Random Default) in settings</li>
                  <li><strong className="text-foreground">Secure Vault Storage:</strong> Passwords are encrypted and stored server-side. They are never returned to the client or displayed on screen under any circumstances.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <span className="font-bold text-foreground block text-sm">User Account Lifecycle & Protection</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong className="text-foreground font-semibold">Recommended: Inactive Status:</strong> Accounts with transaction history should be marked Inactive rather than permanently deleted.</li>
                  <li><strong className="text-purple-600 font-bold">Last Admin Protection:</strong> Prevents deleting or demoting the last active administrator across both client UI and database triggers.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        )}

      </Card>

      {/* SECTION 5: Storage Status */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('storage')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-600" />
            <div>
              <CardTitle className="text-base font-bold">5. Storage Status</CardTitle>
              <CardDescription className="text-xs">Status of Cloudflare R2 Object Storage and image asset policies</CardDescription>
            </div>
          </div>
          {openSections.storage ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.storage && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">Provider</span>
                <span className="font-bold text-sm text-foreground">Cloudflare R2 (S3 API)</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">Bucket Name</span>
                <span className="font-bold text-sm text-primary font-mono">stockflow-assets</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">Max File Size</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">5 MB (JPG / PNG / WebP)</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* SECTION 6: System Information */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('system')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <div>
              <CardTitle className="text-base font-bold">6. System Information</CardTitle>
              <CardDescription className="text-xs">Summary of version metadata, environment, and database connectivity</CardDescription>
            </div>
          </div>
          {openSections.system ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>


        {openSections.system && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Version</span>
                <span className="font-mono font-bold text-xs text-primary">v{APP_CONFIG.version}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Environment</span>
                <span className="font-mono font-bold text-xs uppercase">{import.meta.env.MODE || 'production'}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Database</span>
                <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">Connected</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Projects</span>
                <span className="font-bold text-xs text-foreground">{systemStats.projects} {systemStats.projects === 1 ? 'Project' : 'Projects'}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Users</span>
                <span className="font-bold text-xs text-foreground">{systemStats.users} {systemStats.users === 1 ? 'User' : 'Users'}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">Roles</span>
                <span className="font-bold text-xs text-purple-600 dark:text-purple-400">{systemStats.roles} {systemStats.roles === 1 ? 'Role' : 'Roles'}</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Test Email Modal */}
      <Dialog open={isTestEmailOpen} onOpenChange={setIsTestEmailOpen}>
        <DialogContent className="max-w-md bg-card text-card-foreground rounded-xl border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-blue-600">
              <Send className="w-5 h-5" />
              Test Email Notification
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Send a test notification message through the application SMTP delivery system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div>
              <Label htmlFor="test_recipient" className="text-xs font-semibold">Test Recipient Email *</Label>
              <Input
                id="test_recipient"
                type="email"
                required
                placeholder="target@company.com"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsTestEmailOpen(false)} className="h-9 px-3 rounded-lg text-xs cursor-pointer">
              Cancel
            </Button>
            <Button 
              disabled={sendingTestEmail || !testEmailRecipient} 
              onClick={handleSendTestEmail}
              className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-xs"
            >
              {sendingTestEmail ? 'Sending...' : 'Send Test Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
