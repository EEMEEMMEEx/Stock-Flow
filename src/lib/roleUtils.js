/**
 * Standardized Dynamic Role Utilities
 * Single Source of Truth: /roles (public.roles in database)
 * 
 * Separates Internal Role Keys (e.g., STAFF, REQUESTER, SUPERVISOR, ADMIN, SUPER)
 * from configurable Display Names (e.g., Staff / Requester, Supervisor / Approver).
 */

/**
 * Normalizes any role input (string/object) to a standard uppercase role code
 */
export const normalizeRoleCode = (roleInput) => {
  if (!roleInput) return 'STAFF';
  const raw = typeof roleInput === 'object' 
    ? (roleInput.code || roleInput.role || '') 
    : String(roleInput);
  return raw.toUpperCase().trim() || 'STAFF';
};

export const isRequesterRole = (roleInput) => {
  const code = normalizeRoleCode(roleInput);
  return ['STAFF', 'REQUESTER', 'OPERATOR'].includes(code);
};

export const isSupervisorRole = (roleInput) => {
  const code = normalizeRoleCode(roleInput);
  return ['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(code);
};

export const isAdminRole = (roleInput) => {
  const code = normalizeRoleCode(roleInput);
  return ['ADMIN', 'ADMINISTRATOR'].includes(code);
};

export const isSuperRole = (roleInput) => {
  const code = normalizeRoleCode(roleInput);
  return ['SUPER', 'SUPERADMIN', 'SUPER_ADMIN'].includes(code);
};

/**
 * Resolves user-friendly role label.
 * Prioritizes dynamic roleNameInput (from /roles configuration).
 * Falls back to clean enterprise naming convention if not provided.
 */
export const getRoleLabel = (roleInput, roleNameInput, defaultFallback) => {
  // 1. Dynamic name from database configuration takes absolute priority
  const trimmedName = String(roleNameInput || '').trim();
  if (trimmedName && trimmedName !== 'undefined' && trimmedName !== 'null') {
    // If name is legacy all-caps, convert to clean enterprise Title Case
    if (trimmedName === 'STAFF / REQUESTER') return 'Staff / Requester';
    if (trimmedName === 'SUPERVISOR / APPROVER') return 'Supervisor / Approver';
    if (trimmedName === 'ADMINISTRATOR') return 'Administrator';
    if (trimmedName === 'SUPER ADMIN' || trimmedName === 'Super Admin') return 'System Administrator';
    return trimmedName;
  }

  // 2. Resolve default enterprise label from role code
  const code = normalizeRoleCode(roleInput);

  if (isSuperRole(code)) {
    return 'System Administrator';
  }
  if (isAdminRole(code)) {
    return 'Administrator';
  }
  if (isSupervisorRole(code)) {
    return 'Supervisor / Approver';
  }
  if (isRequesterRole(code)) {
    return 'Staff / Requester';
  }

  return defaultFallback || roleInput || 'Staff / Requester';
};

/**
 * Role Text Color Class Helper
 * Provides distinctive color styling per role code or live configured role object
 */
export const getRoleTextColorClass = (roleInput, roleNameInput, roleObj) => {
  // If roleObj has a specific badge_text_color class configured, use it
  if (roleObj?.badge_text_color) {
    return roleObj.badge_text_color;
  }

  const code = normalizeRoleCode(roleObj?.code || roleInput);

  if (isSuperRole(code)) return 'text-amber-600 dark:text-amber-400 font-bold';
  if (isAdminRole(code)) return 'text-purple-600 dark:text-purple-400 font-bold';
  if (isSupervisorRole(code)) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  if (isRequesterRole(code)) return 'text-blue-600 dark:text-blue-400 font-medium';

  return 'text-purple-600 dark:text-purple-400 font-semibold';
};

