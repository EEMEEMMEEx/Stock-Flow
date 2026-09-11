import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  BookOpen, AlertTriangle, ShieldCheck, User, CheckCircle2, 
  Search, Users, Shield, FolderKanban, ArrowDownToLine, 
  ArrowUpFromLine, FileText, Sparkles, ExternalLink,
  Package, Clock, Layers,
  HelpCircle, SlidersHorizontal, ArrowLeftRight, Info,
  BookmarkCheck, Zap
} from 'lucide-react';
import { useTranslation } from '@/i18n';

const SECTION_CONFIGS = [
  {
    id: 'sidebar-navigation',
    key: 'sidebarNav',
    category: ['staff', 'supervisor', 'admin'],
    icon: Layers,
    iconColor: 'text-primary',
    badgeColor: 'border-l-primary',
    path: '/dashboard',
    roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
    permissions: ['dashboard.view', 'projects.view', 'items.view'],
  },
  {
    id: 'staff-requisition-pos',
    key: 'staffRequisitionPos',
    category: ['staff'],
    icon: ArrowUpFromLine,
    iconColor: 'text-blue-500',
    badgeColor: 'border-l-blue-500',
    path: '/withdrawals',
    roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
    permissions: ['withdrawals.view', 'withdrawals.create'],
  },
  {
    id: 'withdrawal-status-lifecycle',
    key: 'withdrawalStatusLifecycle',
    category: ['staff', 'supervisor'],
    icon: Clock,
    iconColor: 'text-amber-500',
    badgeColor: 'border-l-amber-500',
    path: '/withdrawals',
    roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
    permissions: ['withdrawals.view'],
  },
  {
    id: 'checkouts-and-returns',
    key: 'checkoutsAndReturns',
    category: ['staff', 'checkouts'],
    icon: ArrowLeftRight,
    iconColor: 'text-amber-500',
    badgeColor: 'border-l-amber-500',
    path: '/checkouts',
    roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
    permissions: ['checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend'],
  },
  {
    id: 'supervisor-approval-workflow',
    key: 'supervisorApprovalWorkflow',
    category: ['supervisor'],
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    badgeColor: 'border-l-emerald-500',
    path: '/withdrawals',
    roles: ['SUPERVISOR', 'ADMIN'],
    permissions: ['withdrawals.approve', 'withdrawals.reject'],
  },
  {
    id: 'stock-in-inventory-management',
    key: 'stockInInventoryManagement',
    category: ['supervisor', 'inventory'],
    icon: ArrowDownToLine,
    iconColor: 'text-cyan-500',
    badgeColor: 'border-l-cyan-500',
    path: '/stock-in',
    roles: ['SUPERVISOR', 'ADMIN'],
    permissions: ['stock_in.view', 'stock_in.create'],
  },
  {
    id: 'stock-adjustment-and-transfer',
    key: 'stockAdjustmentAndTransfer',
    category: ['supervisor', 'inventory'],
    icon: SlidersHorizontal,
    iconColor: 'text-indigo-500',
    badgeColor: 'border-l-indigo-500',
    path: '/items',
    roles: ['SUPERVISOR', 'ADMIN'],
    permissions: ['items.adjust_stock', 'items.transfer'],
  },
  {
    id: 'projects-and-items-master',
    key: 'projectsAndItemsMaster',
    category: ['admin'],
    icon: FolderKanban,
    iconColor: 'text-blue-600',
    badgeColor: 'border-l-blue-600',
    path: '/projects',
    roles: ['ADMIN'],
    permissions: ['projects.create', 'projects.update', 'items.create', 'items.update'],
  },
  {
    id: 'user-management-and-avatars',
    key: 'userManagementAndAvatars',
    category: ['admin'],
    icon: Users,
    iconColor: 'text-cyan-600',
    badgeColor: 'border-l-cyan-600',
    path: '/users',
    roles: ['ADMIN'],
    permissions: ['users.view', 'users.create', 'users.update', 'users.deactivate'],
  },
  {
    id: 'dynamic-rbac-role-management',
    key: 'dynamicRbacRoleManagement',
    category: ['admin'],
    icon: Shield,
    iconColor: 'text-purple-600',
    badgeColor: 'border-l-purple-600',
    path: '/roles',
    roles: ['ADMIN'],
    permissions: ['roles.view', 'roles.create', 'roles.manage_permissions'],
  },
  {
    id: 'reports-and-audit-history',
    key: 'reportsAndAuditHistory',
    category: ['supervisor', 'admin'],
    icon: FileText,
    iconColor: 'text-rose-500',
    badgeColor: 'border-l-rose-500',
    path: '/reports',
    roles: ['SUPERVISOR', 'ADMIN'],
    permissions: ['reports.view', 'reports.export', 'history.view'],
  }
];

const Manual = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('all'); // 'all' | 'staff' | 'supervisor' | 'admin' | 'checkouts' | 'inventory'

  const roleFilters = useMemo(() => [
    { id: 'all', label: t('manual.allSections'), icon: BookOpen },
    { id: 'staff', label: t('manual.roles.staff'), icon: User, color: 'text-blue-500' },
    { id: 'supervisor', label: t('manual.roles.supervisor'), icon: ShieldCheck, color: 'text-emerald-500' },
    { id: 'admin', label: t('manual.roles.admin'), icon: Shield, color: 'text-purple-500' },
    { id: 'checkouts', label: t('manual.roles.checkouts'), icon: ArrowLeftRight, color: 'text-amber-500' },
    { id: 'inventory', label: t('manual.roles.inventory'), icon: Package, color: 'text-cyan-500' },
  ], [t]);

  // Comprehensive localized documentation catalog
  const manualSections = useMemo(() => {
    return SECTION_CONFIGS.map((sec) => {
      const stepsRaw = t(`manual.sections.${sec.key}.steps`, { returnObjects: true });
      const steps = Array.isArray(stepsRaw) ? stepsRaw : [];
      return {
        ...sec,
        title: t(`manual.sections.${sec.key}.title`),
        shortDesc: t(`manual.sections.${sec.key}.shortDesc`),
        whatItDoes: t(`manual.sections.${sec.key}.whatItDoes`),
        whoCanUse: t(`manual.sections.${sec.key}.whoCanUse`),
        steps,
        proTips: t(`manual.sections.${sec.key}.proTips`),
        warnings: t(`manual.sections.${sec.key}.warnings`),
      };
    });
  }, [t]);

  // Filter sections based on search query and active role filter
  const filteredSections = useMemo(() => {
    return manualSections.filter((sec) => {
      const matchesFilter = activeRoleFilter === 'all' || sec.category.includes(activeRoleFilter);
      
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesFilter;

      const matchesTitle = sec.title.toLowerCase().includes(query);
      const matchesDesc = sec.shortDesc.toLowerCase().includes(query) || sec.whatItDoes.toLowerCase().includes(query);
      const matchesSteps = sec.steps.some(step => step.toLowerCase().includes(query));
      const matchesRoles = sec.roles.some(r => r.toLowerCase().includes(query));
      const matchesPerms = sec.permissions.some(p => p.toLowerCase().includes(query));

      return matchesFilter && (matchesTitle || matchesDesc || matchesSteps || matchesRoles || matchesPerms);
    });
  }, [searchQuery, activeRoleFilter, manualSections]);

  return (
    <div className="space-y-8 pb-20 max-w-6xl mx-auto">
      {/* Hero Header Section */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-xl bg-card border border-border shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> {t('manual.badgeKnowledgeBase')}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <BookOpen className="w-7 h-7 text-primary shrink-0" />
              {t('manual.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {t('manual.subtitle')}
            </p>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-80 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t('manual.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-background border border-input text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {t('manual.clearSearch')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Role Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-border flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> {t('manual.filterByRole')}
          </span>
          {roleFilters.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeRoleFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveRoleFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary-foreground' : tab.color || 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Responsibility Quick Summary Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role 1: Staff */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-blue-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> {t('manual.roleMatrix.staffTitle')}
            </span>
            <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
              {t('manual.roleMatrix.staffBadge')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('manual.roleMatrix.staffDesc')}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.create</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">checkouts.create</span>
          </div>
        </div>

        {/* Role 2: Supervisor */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-emerald-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> {t('manual.roleMatrix.supervisorTitle')}
            </span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
              {t('manual.roleMatrix.supervisorBadge')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('manual.roleMatrix.supervisorDesc')}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.approve</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">stock_in.create</span>
          </div>
        </div>

        {/* Role 3: Admin */}
        <div className="p-4 rounded-xl border border-border border-l-4 border-l-purple-500 bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" /> {t('manual.roleMatrix.adminTitle')}
            </span>
            <span className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
              {t('manual.roleMatrix.adminBadge')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('manual.roleMatrix.adminDesc')}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">roles.manage_permissions</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">users.update</span>
          </div>
        </div>
      </div>

      {/* Result Counter & Search Status */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {t('manual.showingDocs', { count: filteredSections.length, total: manualSections.length })}
        </span>
        {searchQuery && (
          <span>
            {t('manual.searchResultsFor', { query: searchQuery })}
          </span>
        )}
      </div>

      {/* Manual Content Cards List */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-card border border-border shadow-xs space-y-3">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <h3 className="text-base font-bold text-foreground">{t('manual.noDocsFound')}</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {t('manual.noDocsHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setActiveRoleFilter('all'); }}
              className="text-xs h-8 px-3 rounded-lg mt-2 cursor-pointer"
            >
              {t('manual.showAllDocs')}
            </Button>
          </div>
        ) : (
          filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <Card 
                key={sec.id} 
                id={sec.id}
                className={`rounded-xl bg-card border border-border shadow-xs border-l-4 ${sec.badgeColor} overflow-hidden transition-all duration-200 hover:shadow-md`}
              >
                <CardHeader className="bg-muted/10 pb-4 border-b border-border/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
                        <Icon className={`w-5 h-5 ${sec.iconColor}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-foreground">
                          {sec.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                          {sec.shortDesc}
                        </CardDescription>
                      </div>
                    </div>

                    {/* Quick Jump Link to Live Feature Page */}
                    {sec.path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(sec.path)}
                        className="text-xs h-8 px-3 rounded-lg shrink-0 self-start sm:self-auto flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{t('manual.goToModule')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-5 text-sm">
                  {/* 1. What it does & Who can use */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="md:col-span-2 space-y-1.5">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-primary" /> {t('manual.whatItDoes')}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whatItDoes}
                      </p>
                    </div>

                    <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-border/40 pt-3 md:pt-0 md:pl-4">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-500" /> {t('manual.whoCanUse')}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whoCanUse}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {sec.permissions.map((perm) => (
                          <span key={perm} className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2. Step-by-Step Instructions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> {t('manual.instructionsTitle')}
                    </h4>
                    <div className="space-y-2">
                      {sec.steps.map((step, index) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-background/60 border border-border/40 text-xs text-foreground leading-relaxed"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <span className="flex-1">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Pro-Tips & Safety Warnings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {sec.proTips && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                          <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t('manual.proTipTitle')}
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.proTips}</p>
                      </div>
                    )}

                    {sec.warnings && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> {t('manual.warningsTitle')}
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.warnings}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer Support & System Info */}
      <div className="p-6 rounded-xl bg-muted/30 border border-border/50 text-center space-y-2">
        <h4 className="font-bold text-xs text-foreground flex items-center justify-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-primary" /> {t('manual.helpTitle')}
        </h4>
        <p className="text-xs text-muted-foreground max-w-lg mx-auto">
          {t('manual.helpDesc')}
        </p>
      </div>
    </div>
  );
};

export default Manual;
