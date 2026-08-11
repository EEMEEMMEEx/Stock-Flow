import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/**
 * Reusable Dashboard KPI Summary Card.
 * Supports RBAC permissions, loading states, error states, and accessible links.
 * `featured` renders a larger "primary actionable" card with a call-to-action row.
 * Secondary text stays at least 14px (text-sm) for mobile readability.
 */
const TONE_CLASSES = {
  warning: {
    iconBg: 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    valueText: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    iconBg: 'bg-blue-500/15 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    valueText: 'text-blue-600 dark:text-blue-400',
  },
  indigo: {
    iconBg: 'bg-purple-500/15 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
    valueText: 'text-purple-600 dark:text-purple-400',
  },
  success: {
    iconBg: 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    valueText: 'text-emerald-600 dark:text-emerald-400',
  },
  critical: {
    iconBg: 'bg-red-500/15 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
    valueText: 'text-red-600 dark:text-red-400',
  },
  default: {
    iconBg: 'bg-muted text-muted-foreground border-border/40',
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
  featured = false,
  ctaLabel = null,
  className = '',
}) => {
  const { can } = useAuth();

  // RBAC Permission Check: card is clickable ONLY if user has permission for destination route
  const isAuthorized = permission ? can(permission) : true;
  const isInteractive = Boolean(href && isAuthorized && !loading && !error);

  const style = TONE_CLASSES[tone] || TONE_CLASSES.default;

  const cardInnerContent = (
    <div className={cn('relative z-10 flex h-full flex-col', featured ? 'p-4 sm:p-6' : 'p-4 sm:p-5')}>
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Status Icon Container (44px min touch-friendly visual) */}
        {Icon && (
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-transform group-hover:scale-105',
              featured ? 'bg-primary text-primary-foreground border-transparent' : style.iconBg
            )}
          >
            <Icon className={featured ? 'h-5 w-5' : 'h-5 w-5'} strokeWidth={2.2} aria-hidden="true" />
          </div>
        )}

        {/* Label & Supporting Subtext */}
        <div className="min-w-0 space-y-0.5">
          <span className="block truncate text-sm font-bold tracking-tight text-foreground">
            {label}
          </span>
          {subtext && (
            <span className="block truncate text-sm font-medium text-muted-foreground">
              {subtext}
            </span>
          )}
        </div>
      </div>

      <div className={cn('flex items-end justify-between gap-3', featured ? 'mt-4 sm:mt-5' : 'mt-2.5')}>
        {/* Metric Numeric Value / Loading Skeleton / Error State */}
        <div className="min-w-0">
          {loading ? (
            <Skeleton className={cn('rounded-lg', featured ? 'h-11 w-20' : 'h-9 w-16')} />
          ) : error ? (
            <span
              className={cn('font-bold text-muted-foreground/60', featured ? 'text-3xl' : 'text-2xl sm:text-3xl')}
              title="ไม่สามารถโหลดข้อมูลได้"
            >
              —
            </span>
          ) : (
            <span
              className={cn(
                'font-bold tracking-tight',
                featured ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl',
                style.valueText
              )}
            >
              {typeof value === 'number' ? value.toLocaleString('th-TH') : (value ?? 0)}
            </span>
          )}
        </div>

        {/* Featured CTA */}
        {featured && isInteractive && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">
            {ctaLabel || 'จัดการคำขอ'}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );

  const cardClassName = cn(
    'relative overflow-hidden neu-flat border-0 text-card-foreground',
    featured
      ? 'bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent'
      : '',
    isInteractive ? 'neu-interactive group cursor-pointer' : 'cursor-default',
    className
  );

  if (isInteractive) {
    return (
      <Link
        to={href}
        aria-label={`${label} ${value !== undefined && value !== null ? value : ''} ${subtext || ''}`}
        className="block h-full no-underline rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className={cardClassName}>{cardInnerContent}</div>
      </Link>
    );
  }

  return <div className={cardClassName}>{cardInnerContent}</div>;
};

export default DashboardStatCard;
