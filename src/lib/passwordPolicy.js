/**
 * Password Policy Validator & Strong Password Generator for StockFlow
 */

export const WEAK_PASSWORDS = [
  '123456789012',
  'password123!',
  'admin123456!',
  'stockflow123!',
  'qwerty123456',
  'letmein123456',
  'changeit123!',
  'welcome123456!'
];

/**
 * Validates a password against StockFlow's security policy:
 * - Minimum 12 characters
 * - Requires uppercase (A-Z)
 * - Requires lowercase (a-z)
 * - Requires digit (0-9)
 * - Requires special character (!@#$%^&*)
 * - Rejects leading/trailing whitespace
 * - Rejects known weak passwords
 */
export const validatePasswordPolicy = (password) => {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'กรุณาระบุรหัสผ่าน' };
  }

  if (password !== password.trim()) {
    return { isValid: false, message: 'รหัสผ่านต้องไม่มีช่องว่างนำหน้าหรือต่อท้าย (No leading/trailing whitespace)' };
  }

  if (password.length < 12) {
    return { isValid: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร' };
  }

  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว' };
  }

  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'รหัสผ่านต้องมีตัวพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว' };
  }

  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'รหัสผ่านต้องมีตัวเลข (0-9) อย่างน้อย 1 ตัว' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { isValid: false, message: 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว (!@#$%^&*)' };
  }

  if (WEAK_PASSWORDS.includes(password.toLowerCase())) {
    return { isValid: false, message: 'รหัสผ่านที่ป้อนเป็นรหัสผ่านยอดฮิตที่ไม่อนุมัติให้ใช้งาน กรุณาตั้งรหัสผ่านที่ซับซ้อนขึ้น' };
  }

  return { isValid: true, message: 'รหัสผ่านตรงตามนโยบายความปลอดภัยสมบูรณ์' };
};

/**
 * Generates a compliant 14-character strong random password
 */
export const generateStrongPassword = () => {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = uppers + lowers + digits + symbols;

  let pwd = [
    uppers.charAt(Math.floor(Math.random() * uppers.length)),
    lowers.charAt(Math.floor(Math.random() * lowers.length)),
    digits.charAt(Math.floor(Math.random() * digits.length)),
    symbols.charAt(Math.floor(Math.random() * symbols.length))
  ];

  for (let i = 4; i < 14; i++) {
    pwd.push(all.charAt(Math.floor(Math.random() * all.length)));
  }

  // Shuffle array
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
};
