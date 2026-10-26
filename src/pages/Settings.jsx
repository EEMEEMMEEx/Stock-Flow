import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Settings as SettingsIcon, AppWindow, Package, ShieldCheck, 
  Database, Server, Save, ChevronDown, ChevronRight, RefreshCw, Lock, Sparkles, AlertTriangle, Globe
} from 'lucide-react';
import { APP_CONFIG } from '@/config/appConfig';
import toast from 'react-hot-toast';
import DefaultPasswordManager from '@/components/settings/DefaultPasswordManager';
import { useTranslation } from '@/i18n';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

const Settings = () => {
  const { can } = useAuth();
  const { t } = useTranslation();
  const canUpdate = can('settings.update');

  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(null);
  const [systemStats, setSystemStats] = useState({ projects: 0, users: 0, roles: 0 });

  // Open/Close Accordion Sections
  const [openSections, setOpenSections] = useState({
    app: true,
    inventory: true,
    security: false,
    storage: false,
    system: false
  });

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
      }
    } catch (e) {
      console.warn('Using fallback settings:', e);
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
      await Promise.all([fetchSettingsFromDb(), fetchStats()]);
    } catch (error) {
      console.error('Fetch Settings Error:', error);
      toast.error(t('settings.toasts.fetchError', 'Failed to load system settings'));
    } finally {
      setLoading(false);
    }
  }, [fetchSettingsFromDb, fetchStats, t]);

  useEffect(() => {
    fetchInitialSettings();
  }, [fetchInitialSettings]);

  const handleSaveAppSettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error(t('settings.toasts.permissionDenied', { perm: 'settings.update', defaultValue: 'Permission denied. Requires settings.update' }));

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
          toast.error(t('settings.toasts.migration11Required', 'Please run Migration 11 in Supabase SQL Editor to enable settings table'));
          return;
        }
        throw error;
      }

      if (data?.success) {
        toast.success(t('settings.toasts.appSaved', 'Application and footer settings saved successfully'));
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save App Settings Error:', error);
      toast.error(error.message || t('settings.toasts.saveFailed', 'Failed to save settings'));
    } finally {
      setSavingCategory(null);
    }
  };

  const handleSaveInventorySettings = async (e) => {
    e.preventDefault();
    if (!canUpdate) return toast.error(t('settings.toasts.permissionDenied', { perm: 'settings.update', defaultValue: 'Permission denied. Requires settings.update' }));

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
        toast.success(t('settings.toasts.inventorySaved', 'Inventory and withdrawal rules saved successfully'));
        window.dispatchEvent(new Event('stockflow:settings-updated'));
      }
    } catch (error) {
      console.error('Save Inventory Settings Error:', error);
      toast.error(error.message || t('settings.toasts.saveFailed', 'Failed to save settings'));
    } finally {
      setSavingCategory(null);
    }
  };



  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-primary" />
            {t('settings.title', 'System Settings')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('settings.subtitle', 'Manage system preferences, mail server (SMTP), and security configurations')}
          </p>
        </div>

        <Button 
          variant="outline" 
          onClick={fetchInitialSettings} 
          disabled={loading}
          className="h-9 rounded-lg font-semibold flex items-center gap-2 text-xs cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? t('common.loading', 'Loading...') : t('common.refresh', 'Refresh')}
        </Button>
      </div>

      {/* Read-only permission notice */}
      {!canUpdate && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center gap-2 text-xs">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{t('settings.readOnlyNotice', { perm: 'settings.update', defaultValue: 'Your account has read-only access to settings (Requires settings.update to save changes)' })}</span>
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
              <CardTitle className="text-base font-bold">{t('settings.sections.app.title', '1. Application & Footer')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.sections.app.description', 'System name, organization, description, and footer display')}</CardDescription>
            </div>
          </div>
          {openSections.app ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.app && (
          <CardContent className="pt-2 pb-6 space-y-4 border-t border-border/40">
            <form onSubmit={handleSaveAppSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="app_name" className="text-xs font-semibold">{t('settings.app.appName', 'Application Name')}</Label>
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
                  <Label htmlFor="company_name" className="text-xs font-semibold">{t('settings.app.companyName', 'Company / Organization')}</Label>
                  <Input
                    id="company_name"
                    disabled={!canUpdate}
                    placeholder={t('settings.app.companyPlaceholder', 'e.g. Forth Co., Ltd. (optional)')}
                    value={appForm.company_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, company_name: e.target.value }))}
                    className="mt-1 h-9 text-xs rounded-lg bg-background border border-input"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="app_subtitle" className="text-xs font-semibold">{t('settings.app.appSubtitle', 'Application Subtitle')}</Label>
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
                  <Label className="text-xs font-semibold text-muted-foreground">{t('settings.app.appVersion', 'Application Version (Build Metadata)')}</Label>
                  <Input
                    disabled
                    value={`v${APP_CONFIG.version}`}
                    className="mt-1 h-9 text-xs rounded-lg bg-muted/40 text-muted-foreground font-mono cursor-not-allowed border border-input"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">{t('settings.app.environment', 'Environment')}</Label>
                  <Input
                    disabled
                    value={import.meta.env.MODE || 'production'}
                    className="mt-1 h-9 text-xs rounded-lg bg-muted/40 text-muted-foreground font-mono uppercase cursor-not-allowed border border-input"
                  />
                </div>
              </div>

              {/* System Language Preference */}
              <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    {t('settings.app.displayLanguage', 'Display Language')}
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('settings.defaultLangDesc', 'Configure application default display language (Thai / English)')}
                  </p>
                </div>
                <div className="shrink-0">
                  <LanguageSwitcher />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('settings.app.liveFooterPreview', 'Live Footer Preview:')}</span>
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
                    {savingCategory === 'app' ? t('settings.app.savingBtn', 'Saving...') : t('settings.app.saveBtn', 'Save App & Footer Settings')}
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
              <CardTitle className="text-base font-bold">{t('settings.sections.inventory.title', '2. Inventory & Withdrawal Rules')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.sections.inventory.description', 'Configure low-stock threshold, withdrawal purpose requirements, and transaction policies')}</CardDescription>
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
                  {t('settings.inventory.policyTitle', 'Approval Policy: All-or-Nothing (Enforced by system to prevent negative stock)')}
                </span>
                <p className="text-[11px] leading-relaxed opacity-90 pl-5.5">
                  {t('settings.inventory.policyDesc', 'StockFlow enforces atomic all-or-nothing approvals. If any requested item lacks sufficient stock, approvers cannot partially fulfill the order and must reject the entire request to maintain inventory integrity.')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="low_stock_threshold" className="text-xs font-semibold">{t('settings.inventory.lowStockThreshold', 'Default Low Stock Threshold')}</Label>
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
                    {t('settings.inventory.lowStockThresholdHint', '* When inventory falls below this threshold, items display a "Low Stock" badge in inventory')}
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
                    <span>{t('settings.inventory.requirePurpose', 'Require purpose for all withdrawal requests')}</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_inactive_project_view}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_inactive_project_view: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>{t('settings.inventory.allowInactiveView', 'Allow users to view history and balances from inactive projects')}</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={inventoryForm.allow_item_deletion}
                      onChange={(e) => setInventoryForm(prev => ({ ...prev, allow_item_deletion: e.target.checked }))}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>{t('settings.inventory.allowItemDeletion', 'Enable Item Deletion Button')}</span>
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
                      <span>{t('settings.inventory.allowDirectStockAdjustment', 'Enable Current Stock Editing on Master Items')}</span>
                    </label>
                    <div className="pl-6.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                      {t('settings.inventory.directStockAdjustmentWarning', 'Warning: Adjust physical stock before enabling direct stock editing.')}
                    </div>
                  </div>
                </div>
              </div>

              {canUpdate && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingCategory === 'inventory'} className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-xs font-semibold cursor-pointer shadow-xs">
                    <Save className="w-3.5 h-3.5" />
                    {savingCategory === 'inventory' ? t('settings.inventory.savingBtn', 'Saving...') : t('settings.inventory.saveBtn', 'Save Inventory Rules')}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* SECTION 3: User & Security Policy */}
      <Card className="rounded-xl bg-card border border-border shadow-xs overflow-hidden">
        <CardHeader 
          onClick={() => toggleSection('security')}
          className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between py-4"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <div>
              <CardTitle className="text-base font-bold">{t('settings.sections.security.title', '3. User & Security Policy')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.sections.security.description', 'Password policy, user account management, and application-level security')}</CardDescription>
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
                <span className="font-bold text-foreground block text-sm">{t('settings.securityPolicy.passwordPolicyTitle', 'Password Policy')}</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>{t('settings.securityPolicy.passwordReq1', 'Passwords must be at least 12 characters and include uppercase, lowercase, numbers, and special characters')}</li>
                  <li>{t('settings.securityPolicy.passwordReq2', 'Support for generating secure temporary passwords (Set Random Default) in settings')}</li>
                  <li><strong className="text-foreground">{t('settings.securityPolicy.vaultTitle', 'Secure Vault Storage:')}</strong> {t('settings.securityPolicy.vaultDesc', 'Passwords are encrypted and stored server-side. They are never returned to the client or displayed on screen under any circumstances.')}</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <span className="font-bold text-foreground block text-sm">{t('settings.securityPolicy.lifecycleTitle', 'User Account Lifecycle & Protection')}</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong className="text-foreground font-semibold">{t('settings.securityPolicy.inactiveRecommendTitle', 'Recommended: Inactive Status:')}</strong> {t('settings.securityPolicy.inactiveRecommendDesc', 'Accounts with transaction history should be marked Inactive rather than permanently deleted.')}</li>
                  <li><strong className="text-purple-600 font-bold">{t('settings.securityPolicy.lastAdminTitle', 'Last Admin Protection:')}</strong> {t('settings.securityPolicy.lastAdminDesc', 'Prevents deleting or demoting the last active administrator across both client UI and database triggers.')}</li>
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
              <CardTitle className="text-base font-bold">{t('settings.sections.storage.title', '5. Storage Status')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.sections.storage.description', 'Status of Cloudflare R2 Object Storage and image asset policies')}</CardDescription>
            </div>
          </div>
          {openSections.storage ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>

        {openSections.storage && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('settings.storage.provider', 'Provider')}</span>
                <span className="font-bold text-sm text-foreground">{t('settings.storage.providerValue', 'Cloudflare R2 (S3 API)')}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('settings.storage.bucketName', 'Bucket Name')}</span>
                <span className="font-bold text-sm text-primary font-mono">stockflow-assets</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('settings.storage.maxFileSize', 'Max File Size')}</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">{t('settings.storage.maxFileSizeValue', '5 MB (JPG / PNG / WebP)')}</span>
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
              <CardTitle className="text-base font-bold">{t('settings.sections.system.title', '6. System Information')}</CardTitle>
              <CardDescription className="text-xs">{t('settings.sections.system.description', 'Summary of version metadata, environment, and database connectivity')}</CardDescription>
            </div>
          </div>
          {openSections.system ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardHeader>


        {openSections.system && (
          <CardContent className="pt-2 pb-6 border-t border-border/40 text-xs space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('settings.system.version', 'Version')}</span>
                <span className="font-mono font-bold text-xs text-primary">v{APP_CONFIG.version}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('settings.system.environment', 'Environment')}</span>
                <span className="font-mono font-bold text-xs uppercase">{import.meta.env.MODE || 'production'}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('settings.system.database', 'Database')}</span>
                <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">{t('settings.system.connected', 'Connected')}</span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('common.allProjects', 'Projects')}</span>
                <span className="font-bold text-xs text-foreground">
                  {t('settings.system.projects', { count: systemStats.projects, defaultValue: `${systemStats.projects} Projects` })}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('common.users', 'Users')}</span>
                <span className="font-bold text-xs text-foreground">
                  {t('settings.system.users', { count: systemStats.users, defaultValue: `${systemStats.users} Users` })}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-[10px] text-muted-foreground block">{t('common.allRoles', 'Roles')}</span>
                <span className="font-bold text-xs text-purple-600 dark:text-purple-400">
                  {t('settings.system.roles', { count: systemStats.roles, defaultValue: `${systemStats.roles} Roles` })}
                </span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default Settings;
