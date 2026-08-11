import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import DashboardStatCard from '@/components/dashboard/DashboardStatCard';
import ProjectBalanceChart from '@/components/dashboard/ProjectBalanceChart';
import RecentActivity from '@/components/dashboard/RecentActivity';
import QuickActions from '@/components/dashboard/QuickActions';
import {
  AlertCircle,
  FolderKanban,
  Package,
  ArrowUpFromLine,
  LayoutDashboard,
} from 'lucide-react';

const INITIAL_SECTIONS = {
  kpi: { status: 'loading', data: null, error: null },
  activity: { status: 'loading', data: [], error: null },
  balance: { status: 'loading', data: [], error: null },
};

const Dashboard = () => {
  const { profile, can } = useAuth();
  const [sections, setSections] = useState(INITIAL_SECTIONS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // ---- Data fetchers (each section fails independently) ----

  const fetchKpi = useCallback(async () => {
    // "วันนี้" ตาม local timezone ของผู้ใช้ (ไม่ใช่ UTC midnight)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartISO = startOfToday.toISOString();

    const buildCount = (table, apply) => {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      if (apply) query = apply(query);
      return query;
    };

    const results = await Promise.allSettled([
      buildCount('projects', (q) => q.eq('status', 'active')),
      buildCount('items'),
      buildCount('withdrawal_orders', (q) => q.eq('status', 'pending')),
      buildCount('withdrawal_orders', (q) => q.gte('requested_at', todayStartISO)),
    ]);

    const counts = results.map((result) =>
      result.status === 'fulfilled' && !result.value.error ? result.value.count || 0 : null
    );

    if (counts.some((count) => count === null)) {
      throw new Error('ไม่สามารถโหลดข้อมูลสรุป (KPI) ได้');
    }

    return {
      projectCount: counts[0],
      itemCount: counts[1],
      pendingCount: counts[2],
      todayWithdrawals: counts[3],
    };
  }, []);

  const fetchActivity = useCallback(async () => {
    const { data, error } = await supabase
      .from('withdrawal_orders')
      .select(`
        *,
        projects(id, name),
        profiles!withdrawal_orders_requested_by_fkey(id, full_name),
        withdrawal_items(id, quantity, items(name, unit))
      `)
      .order('requested_at', { ascending: false })
      .limit(6);

    if (error) throw error;
    return data || [];
  }, []);

  const fetchBalance = useCallback(async () => {
    // ดึงเฉพาะคอลัมน์ที่จำเป็น — aggregation ฝั่ง client ใน ProjectBalanceChart
    const { data, error } = await supabase
      .from('stock_balance')
      .select('project_id, project_name, balance');

    if (error) throw error;
    return data || [];
  }, []);

  const sectionFetchers = { kpi: fetchKpi, activity: fetchActivity, balance: fetchBalance };

  // ---- Load one section (supports silent refresh) ----
  const loadSection = useCallback(
    async (key, { silent = false } = {}) => {
      const fetcher = sectionFetchers[key];
      if (!fetcher) return;

      if (!silent) {
        setSections((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'loading', error: null },
        }));
      }

      try {
        const data = await fetcher();
        if (!mountedRef.current) return;
        const isEmpty = Array.isArray(data) && data.length === 0;
        setSections((prev) => ({
          ...prev,
          [key]: { status: isEmpty ? 'empty' : 'success', data, error: null },
        }));
      } catch (err) {
        console.error(`Dashboard [${key}] fetch error:`, err);
        if (!mountedRef.current) return;
        setSections((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            status: 'error',
            error: err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
          },
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchKpi, fetchActivity, fetchBalance]
  );

  // ---- Refresh all sections in parallel (stale updates guarded by mountedRef) ----
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled(
      Object.keys(sectionFetchers).map((key) => loadSection(key, { silent: true }))
    );
    if (!mountedRef.current) return;
    setLastUpdatedAt(new Date());
    setRefreshing(false);
  }, [loadSection]);

  // Initial load + unmount guard
  useEffect(() => {
    mountedRef.current = true;
    refreshAll();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshAll]);

  // ---- Accessibility live region: announce refresh / errors ----
  const liveAnnouncement = useMemo(() => {
    const hasSectionError = Object.values(sections).some((s) => s.status === 'error');
    if (refreshing) return 'กำลังรีเฟรชข้อมูลแดชบอร์ด';
    if (hasSectionError) return 'บางส่วนของแดชบอร์ดโหลดข้อมูลไม่สำเร็จ';
    if (lastUpdatedAt) return `อัปเดตข้อมูลแดชบอร์ดล่าสุดเมื่อ ${format(lastUpdatedAt, 'HH:mm:ss')}`;
    return '';
  }, [sections, refreshing, lastUpdatedAt]);

  const kpiStatus = sections.kpi.status;
  const kpi = sections.kpi.data || {};

  const statCards = [
    {
      id: 'pending',
      label: 'รออนุมัติเบิกจ่าย',
      value: kpi.pendingCount,
      subtext: 'คำขอที่รอการพิจารณา',
      icon: AlertCircle,
      tone: 'warning',
      href: '/withdrawals',
      permission: 'withdrawals.view',
      featured: true,
      ctaLabel: 'จัดการคำขอ',
      className: 'sm:col-span-2',
    },
    {
      id: 'projects',
      label: 'โครงการ Active',
      value: kpi.projectCount,
      subtext: 'โครงการที่กำลังใช้งาน',
      icon: FolderKanban,
      tone: 'info',
      href: '/projects',
      permission: 'projects.view',
    },
    {
      id: 'items',
      label: 'รายการวัสดุ',
      value: kpi.itemCount,
      subtext: 'วัสดุทั้งหมดในระบบ',
      icon: Package,
      tone: 'indigo',
      href: '/items',
      permission: 'items.view',
    },
    {
      id: 'today_withdrawals',
      label: 'เบิกจ่ายวันนี้',
      value: kpi.todayWithdrawals,
      subtext: 'คำขอเบิกจ่ายวันนี้',
      icon: ArrowUpFromLine,
      tone: 'success',
      href: '/withdrawals',
      permission: 'withdrawals.view',
      className: 'sm:col-span-2 lg:col-span-1',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Skip link target announcement & live region */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b pb-2 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-2.5 text-indigo-600 dark:text-indigo-400">
              <LayoutDashboard className="h-6 w-6" aria-hidden="true" />
            </div>
            <span>Dashboard</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ยินดีต้อนรับกลับมา,{' '}
            <span className="font-semibold text-foreground">{profile?.full_name}</span>.
            นี่คือสรุปข้อมูล Stock วันนี้
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {lastUpdatedAt
              ? `อัปเดตล่าสุด ${format(lastUpdatedAt, 'dd/MM/yyyy HH:mm:ss')}`
              : 'กำลังโหลดข้อมูล…'}
          </p>
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label="รีเฟรชข้อมูลแดชบอร์ด"
            title="รีเฟรชข้อมูล"
            aria-busy={refreshing}
            className="neu-button flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RefreshCw
              className={cn('h-5 w-5', refreshing && 'animate-spin motion-reduce:animate-none')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* KPI Summary Grid — pending approval is the primary actionable card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {statCards.map((stat) => (
          <DashboardStatCard
            key={stat.id}
            label={stat.label}
            value={stat.value}
            subtext={stat.subtext}
            icon={stat.icon}
            tone={stat.tone}
            href={stat.href}
            permission={stat.permission}
            loading={kpiStatus === 'loading'}
            error={kpiStatus === 'error'}
            featured={stat.featured}
            ctaLabel={stat.ctaLabel}
            className={stat.className}
          />
        ))}

        {/* Quick actions (permission-filtered) */}
        <QuickActions className="sm:col-span-2 lg:col-span-3" />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Left: Project Balance Chart */}
        <ProjectBalanceChart
          className="lg:col-span-8"
          data={sections.balance.data}
          status={sections.balance.status}
          error={sections.balance.error}
          onRetry={() => loadSection('balance')}
        />

        {/* Right: Recent Activity */}
        <RecentActivity
          className="lg:col-span-4"
          data={sections.activity.data}
          status={sections.activity.status}
          error={sections.activity.error}
          onRetry={() => loadSection('activity')}
          canViewHistory={can('history.view')}
        />
      </div>
    </div>
  );
};

export default Dashboard;
