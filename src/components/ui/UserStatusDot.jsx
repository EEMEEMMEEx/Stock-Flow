import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * UserStatusDot
 * Accessible, dynamic status indicator dot for user accounts.
 *
 * Requirements:
 * - Displays ONLY the colored indicator dot (no visible text label)
 * - Color Mapping:
 *   - Active    → Green dot (bg-emerald-500)
 *   - Inactive  → Red dot (bg-red-500)
 *   - Suspended → Amber dot (bg-amber-500)
 * - Preserves accessibility via aria-label, role="status", title tooltip, and screen-reader text
 */
export const UserStatusDot = ({
  status = 'active',
  size = 'md',
  className = '',
  showPulse = true,
  title = null,
}) => {
  const { t } = useTranslation();
  const normalized = (status || 'active').toLowerCase().trim();

  let dotColor = 'bg-emerald-500';
  let haloClass = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30';
  let label = t('common.active', 'Active');
  let hasPulse = showPulse;

  if (normalized === 'inactive') {
    dotColor = 'bg-red-500';
    haloClass = 'bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-500/30';
    label = t('common.inactive', 'Inactive');
    hasPulse = false;
  } else if (normalized === 'suspended') {
    dotColor = 'bg-amber-500';
    haloClass = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30';
    label = t('common.suspended', 'Suspended');
    hasPulse = false;
  }

  const tooltipTitle = title || label;

  // Size configurations
  // sm: 6px dot inside 14px halo
  // md: 8px dot inside 18px halo
  // lg: 10px dot inside 22px halo
  const sizeMap = {
    sm: {
      wrapper: 'w-4 h-4',
      dot: 'w-1.5 h-1.5',
    },
    md: {
      wrapper: 'w-5 h-5',
      dot: 'w-2 h-2',
    },
    lg: {
      wrapper: 'w-6 h-6',
      dot: 'w-2.5 h-2.5',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${currentSize.wrapper} ${haloClass} select-none shrink-0 transition-all ${className}`}
      title={tooltipTitle}
      aria-label={tooltipTitle}
      role="status"
    >
      <span
        className={`rounded-full ${currentSize.dot} ${dotColor} ${
          hasPulse ? 'animate-pulse' : ''
        } shadow-xs shrink-0`}
      />
      <span className="sr-only">{tooltipTitle}</span>
    </span>
  );
};

export default UserStatusDot;
