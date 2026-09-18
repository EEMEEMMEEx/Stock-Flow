import React from 'react';
import { Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n';

/**
 * StatusBadge
 * Unified, icon-only status badge for orders, requisitions, and transactions.
 *
 * Requirements:
 * - Icon only (all visible text labels removed)
 * - Color mapping:
 *   - Rejected  → Red error/cross icon (XCircle, text-rose-600)
 *   - Approved  → Green approval/check icon (CheckCircle2, text-emerald-600)
 *   - Completed → Completed/success icon (CheckCircle2, text-emerald-600)
 *   - Pending   → Pending/warning icon (Clock, text-amber-600)
 *   - Shortage  → Warning icon (AlertTriangle, text-amber-600)
 * - Full accessibility via role="status", title tooltip, aria-label, and sr-only text
 */
export const StatusBadge = ({
  status,
  has_shortage = false,
  is_shortage_override = false,
  size = 'md',
  className = '',
  title = null,
}) => {
  const { t } = useTranslation();
  const normalized = (status || '').toLowerCase().trim();
  const isShortage = has_shortage || is_shortage_override;

  let config = null;

  switch (normalized) {
    case 'pending':
      config = {
        icon: Clock,
        label: t('common.pending', 'Pending'),
        colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
        pulse: true,
      };
      break;

    case 'approved':
      if (isShortage) {
        config = {
          icon: AlertTriangle,
          label: t('withdrawals.approvedShortage', 'Approved (Shortage)'),
          colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/40',
          pulse: false,
        };
      } else {
        config = {
          icon: CheckCircle2,
          label: t('common.approved', 'Approved'),
          colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          pulse: false,
        };
      }
      break;

    case 'completed':
      if (isShortage) {
        config = {
          icon: AlertTriangle,
          label: t('withdrawals.completedShortage', 'Completed (Shortage)'),
          colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/40',
          pulse: false,
        };
      } else {
        config = {
          icon: CheckCircle2,
          label: t('common.completed', 'Completed'),
          colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          pulse: false,
        };
      }
      break;

    case 'rejected':
      config = {
        icon: XCircle,
        label: t('common.rejected', 'Rejected'),
        colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
        pulse: false,
      };
      break;

    default:
      if (!status) return null;
      config = {
        icon: Clock,
        label: status,
        colorClass: 'text-muted-foreground bg-muted border-border',
        pulse: false,
      };
  }

  const Icon = config.icon;
  const tooltipLabel = title || config.label;

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-7 h-7',
    lg: 'w-8 h-8',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-4.5 h-4.5',
  };

  const badgeSize = sizeClasses[size] || sizeClasses.md;
  const iconSize = iconSizes[size] || iconSizes.md;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border ${badgeSize} ${config.colorClass} ${
        config.pulse ? 'animate-pulse' : ''
      } shrink-0 select-none shadow-2xs transition-all ${className}`}
      title={tooltipLabel}
      aria-label={tooltipLabel}
      role="status"
    >
      <Icon className={`${iconSize} shrink-0`} />
      <span className="sr-only">{tooltipLabel}</span>
    </span>
  );
};

export default StatusBadge;
