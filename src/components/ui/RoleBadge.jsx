import React from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Standardized Role Label Helper
 * User-friendly names according to system specification:
 * - staff → STAFF / REQUESTER
 * - supervisor → SUPERVISOR / APPROVER
 * - admin → ADMINISTRATOR
 * - super → SUPER ADMIN
 */
export const getRoleLabel = (roleInput, roleNameInput) => {
  if (!roleInput && !roleNameInput) return 'STAFF / REQUESTER';
  
  const rawCode = String(roleInput || '').toUpperCase().trim();
  const rawName = String(roleNameInput || '').toUpperCase().trim();

  if (rawCode === 'SUPER' || rawName.includes('SUPER ADMIN') || rawName.includes('SUPERADMIN') || rawName.includes('ผู้ดูแลระบบสูงสุด')) {
    return 'SUPER ADMIN';
  }
  if (rawCode === 'ADMIN' || ['ADMINISTRATOR', 'ผู้ดูแลระบบ'].includes(rawName) || rawCode === 'ADMINISTRATOR') {
    return 'ADMINISTRATOR';
  }
  if (rawCode === 'SUPERVISOR' || ['APPROVER', 'MANAGER', 'ผู้จัดการ / ผู้อนุมัติ', 'SUPERVISOR / APPROVER'].includes(rawName) || ['APPROVER', 'MANAGER'].includes(rawCode)) {
    return 'SUPERVISOR / APPROVER';
  }
  if (rawCode === 'STAFF' || ['REQUESTER', 'OPERATOR', 'เจ้าหน้าที่ / ผู้ขอเบิก', 'STAFF / REQUESTER'].includes(rawName) || ['REQUESTER', 'OPERATOR'].includes(rawCode)) {
    return 'STAFF / REQUESTER';
  }

  return roleNameInput || roleInput;
};

/**
 * Standardized UI Role Badge Component
 * Ensures visual distinction, proper friendly labels, scalable SVG Shield icons, and zero emojis.
 */
export const RoleBadge = ({
  role,
  roleName,
  roleObj,
  className = '',
  size = 'md', // 'sm' | 'md' | 'lg'
  showIcon = true
}) => {
  const code = (roleObj?.code || role || '').toUpperCase().trim();
  const name = roleObj?.name || roleName || '';
  const label = getRoleLabel(code, name);

  const isSuper = code === 'SUPER' || label === 'SUPER ADMIN';
  const isAdmin = !isSuper && (code === 'ADMIN' || label === 'ADMINISTRATOR' || ['ADMIN', 'ADMINISTRATOR'].includes(code));
  const isSupervisor = !isSuper && !isAdmin && (code === 'SUPERVISOR' || label === 'SUPERVISOR / APPROVER' || ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(code));
  const isStaff = !isSuper && !isAdmin && !isSupervisor && (code === 'STAFF' || label === 'STAFF / REQUESTER' || ['STAFF', 'OPERATOR', 'REQUESTER'].includes(code));

  // Size styling
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
    lg: 'text-xs px-3 py-1 gap-1.5 font-bold'
  }[size] || 'text-xs px-2.5 py-0.5 gap-1.5';

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  }[size] || 'w-3.5 h-3.5';

  // Super Admin Badge Style: Elegant Rose/Amber/Purple Glow
  if (isSuper) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-bold uppercase tracking-wide',
          'bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-rose-500/15',
          'text-purple-900 dark:text-purple-200 border border-purple-300/80 dark:border-purple-700/80 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <Sparkles className={cn(iconSizes, 'text-amber-500 dark:text-amber-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // Administrator Badge Style: Distinctive Rich Purple
  if (isAdmin) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-bold uppercase tracking-wide',
          'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <Shield className={cn(iconSizes, 'text-purple-600 dark:text-purple-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // Supervisor Badge Style: Emerald
  if (isSupervisor) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-wide',
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <Shield className={cn(iconSizes, 'text-emerald-600 dark:text-emerald-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // Staff / Requester Badge Style: Clean Blue
  if (isStaff) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-wide',
          'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <Shield className={cn(iconSizes, 'text-blue-600 dark:text-blue-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // Custom Role Style
  const customBg = roleObj?.badge_background || 'bg-slate-100 dark:bg-slate-800';
  const customText = roleObj?.badge_text_color || 'text-slate-700 dark:text-slate-300';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium uppercase tracking-wide border border-border/60 shadow-2xs',
        customBg,
        customText,
        sizeClasses,
        className
      )}
    >
      {showIcon && <Shield className={cn(iconSizes, 'opacity-70 shrink-0')} />}
      <span>{label}</span>
    </span>
  );
};

export default RoleBadge;
