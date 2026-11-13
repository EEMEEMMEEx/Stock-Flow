import { Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  getRoleLabel, 
  normalizeRoleCode, 
  isSuperRole, 
  isAdminRole, 
  isSupervisorRole, 
  isRequesterRole 
} from '@/lib/roleUtils';

/**
 * Standardized UI Role Badge Component
 * Prioritizes dynamic role configuration from /roles (public.roles)
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
  const code = normalizeRoleCode(roleObj?.code || role);
  const name = roleObj?.name || roleName || '';
  const label = getRoleLabel(code, name);

  const isSuper = isSuperRole(code);
  const isAdmin = !isSuper && isAdminRole(code);
  const isSupervisor = !isSuper && !isAdmin && isSupervisorRole(code);
  const isStaff = !isSuper && !isAdmin && !isSupervisor && isRequesterRole(code);

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

  // 1. If explicit badge theme is configured from /roles, use it directly
  if (roleObj?.badge_background && roleObj?.badge_text_color) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold tracking-wide border border-border/60 shadow-2xs',
          roleObj.badge_background,
          roleObj.badge_text_color,
          sizeClasses,
          className
        )}
      >
        {showIcon && (
          isSuper ? (
            <ShieldCheck className={cn(iconSizes, 'text-amber-500 shrink-0')} />
          ) : (
            <Shield className={cn(iconSizes, 'opacity-80 shrink-0')} />
          )
        )}
        <span>{label}</span>
      </span>
    );
  }

  // 2. System Administrator Badge Default Style: Amber Authority
  if (isSuper) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-bold',
          'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <ShieldCheck className={cn(iconSizes, 'text-amber-600 dark:text-amber-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // 3. Administrator Badge Default Style: Sky Authority
  if (isAdmin) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-bold',
          'bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30 shadow-2xs',
          sizeClasses,
          className
        )}
      >
        {showIcon && <Shield className={cn(iconSizes, 'text-sky-600 dark:text-sky-400 shrink-0')} />}
        <span>{label}</span>
      </span>
    );
  }

  // 4. Supervisor Badge Default Style: Emerald
  if (isSupervisor) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold tracking-wide',
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

  // 5. Staff / Requester Badge Default Style: Clean Blue
  if (isStaff) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold tracking-wide',
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

  // 6. Custom Fallback Role Style
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium tracking-wide border border-border/60 shadow-2xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
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
