/**
 * Standardized Role Label Helper
 * User-friendly names according to system specification:
 * - staff -> STAFF / REQUESTER
 * - supervisor -> SUPERVISOR / APPROVER
 * - admin -> ADMINISTRATOR
 * - super -> SUPER ADMIN
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
 * Role Text Color Class Helper
 * Provides distinctive color styling per role code/label while maintaining consistent RBAC theme
 */
export const getRoleTextColorClass = (roleInput, roleNameInput) => {
  const label = getRoleLabel(roleInput, roleNameInput);
  if (label === 'SUPER ADMIN') return 'text-amber-600 dark:text-amber-400 font-bold';
  if (label === 'ADMINISTRATOR') return 'text-purple-600 dark:text-purple-400 font-bold';
  if (label === 'SUPERVISOR / APPROVER') return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  if (label === 'STAFF / REQUESTER') return 'text-blue-600 dark:text-blue-400 font-medium';
  return 'text-purple-600 dark:text-purple-400 font-semibold';
};
