import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Reusable Dashboard KPI Summary Card
 * Adheres to StockFlow Design System (Neumorphic/Glassmorphism) & UI/UX Pro Max standards.
 * Supports RBAC permissions, loading states, error states, and accessible interactive links.
 */
const TONE_CLASSES = {
  warning: {
    iconBg: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    valueText: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    iconBg: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    valueText: 'text-blue-600 dark:text-blue-400',
  },
  indigo: {
    iconBg: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20',
    valueText: 'text-purple-600 dark:text-purple-400',
  },
  success: {
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    valueText: 'text-emerald-600 dark:text-emerald-400',
  },
  critical: {
    iconBg: 'bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    valueText: 'text-red-600 dark:text-red-400',
  },
  default: {
    iconBg: 'bg-muted text-muted-foreground border-border/60',
    valueText: 'text-foreground',
  },
};

const DashboardStatCard = ({
  label,
  value,
  icon: Icon,
  tone = 'default',
  href = null,
  subtext = null,
  loading = false,
  error = false,
  permission = null,
}) => {
  const { can } = useAuth();

  // RBAC Permission Check: Card is clickable ONLY if user has permission for destination route
  const isAuthorized = permission ? can(permission) : true;
  const isInteractive = Boolean(href && isAuthorized && !loading && !error);

  const style = TONE_CLASSES[tone] || TONE_CLASSES.default;

  const cardInnerContent = (
    <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4 h-full relative z-10">
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Status Icon Container */}
        {Icon && (
          <div className={`p-2.5 rounded-xl border shadow-xs shrink-0 ${style.iconBg} transition-colors`}>
            <Icon className="w-5 h-5" strokeWidth={2.2} />
          </div>
        )}

        {/* Label & Supporting Subtext */}
        <div className="min-w-0 space-y-0.5">
          <span className="text-xs sm:text-sm font-bold tracking-tight text-foreground truncate block">
            {label}
          </span>
          {subtext && (
            <span className="text-[11px] text-muted-foreground truncate block font-medium">
              {subtext}
            </span>
          )}
        </div>
      </div>

      {/* Metric Numeric Value / Loading Skeleton / Error State */}
      <div className="shrink-0 text-right">
        {loading ? (
          <Skeleton className="h-8 w-14 rounded-lg" />
        ) : error ? (
          <span className="text-xl font-bold text-muted-foreground/60" title="ไม่สามารถโหลดข้อมูลได้">—</span>
        ) : (
          <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${style.valueText}`}>
            {typeof value === 'number' ? value.toLocaleString('th-TH') : (value ?? 0)}
          </span>
        )}
      </div>
    </CardContent>
  );

  const cardClassName = `bg-card border border-border/80 shadow-xs overflow-hidden relative transition-all duration-150 ${
    isInteractive 
      ? 'group cursor-pointer hover:border-primary/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' 
      : 'cursor-default'
  }`;

  if (isInteractive) {
    return (
      <Link 
        to={href} 
        aria-label={`${label} ${value !== undefined && value !== null ? value : ''} ${subtext || ''}`}
        className="block h-full no-underline"
      >
        <Card className={cardClassName}>
          {cardInnerContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cardClassName}>
      {cardInnerContent}
    </Card>
  );
};

export default DashboardStatCard;
