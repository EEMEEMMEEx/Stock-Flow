import { format, parseISO, isValid } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import i18n from '@/i18n/i18n';

/**
 * Get the currently active application language
 * @returns {'th' | 'en'}
 */
export const getCurrentLanguage = () => {
  return i18n.language === 'en' ? 'en' : 'th';
};

/**
 * Format a Date object or ISO string to localized representation.
 * Supports Buddhist Era (B.E. / พ.ศ.) for Thai when specified or standard localized dates.
 * 
 * @param {Date | string | number} date - Date to format
 * @param {string} formatStr - date-fns format string (e.g., 'dd MMM yyyy', 'dd/MM/yyyy HH:mm')
 * @param {object} options - Options object: { buddhistYear: boolean, lang: 'th' | 'en' }
 * @returns {string} Formatted date string
 */
export const formatI18nDate = (date, formatStr = 'dd MMM yyyy', options = {}) => {
  if (!date) return '-';

  let dateObj = date;
  if (typeof date === 'string') {
    dateObj = parseISO(date);
    if (!isValid(dateObj)) {
      dateObj = new Date(date);
    }
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  }

  if (!isValid(dateObj)) return '-';

  const lang = options.lang || getCurrentLanguage();
  const locale = lang === 'th' ? th : enUS;
  const isThai = lang === 'th';

  // Buddhist year (+543) support for Thai
  if (isThai && (options.buddhistYear ?? true)) {
    const gregYear = dateObj.getFullYear();
    const budYear = gregYear + 543;
    
    // Format without year first, then insert Buddhist year
    let formatted = format(dateObj, formatStr, { locale });
    // Replace 4-digit or 2-digit Gregorian year with Buddhist year
    formatted = formatted.replace(new RegExp(String(gregYear), 'g'), String(budYear));
    const shortGregYear = String(gregYear).slice(-2);
    const shortBudYear = String(budYear).slice(-2);
    formatted = formatted.replace(new RegExp(`\\b${shortGregYear}\\b`, 'g'), shortBudYear);
    return formatted;
  }

  return format(dateObj, formatStr, { locale });
};

/**
 * Format numbers with localized separators and decimal places
 * @param {number | string} value
 * @param {Intl.NumberFormatOptions} options
 * @param {string} lang
 * @returns {string}
 */
export const formatI18nNumber = (value, options = {}, lang) => {
  const num = Number(value);
  if (isNaN(num)) return '0';
  const targetLang = lang || getCurrentLanguage();
  const locale = targetLang === 'th' ? 'th-TH' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(num);
};

/**
 * Format currency amounts with proper currency symbol
 * @param {number | string} amount
 * @param {string} currency - Default 'THB'
 * @param {string} lang
 * @returns {string}
 */
export const formatI18nCurrency = (amount, currency = 'THB', lang) => {
  const num = Number(amount);
  if (isNaN(num)) return '฿0.00';
  const targetLang = lang || getCurrentLanguage();
  const locale = targetLang === 'th' ? 'th-TH' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

/**
 * Helper for Recharts Tooltip formatting with active language awareness
 * @param {Function} t - translation function
 * @returns {Function} Tooltip formatter callback
 */
export const createRechartsTooltipFormatter = (t) => {
  return (value, name, item) => {
    const formattedVal = formatI18nNumber(value);
    const unit = item?.payload?.unit || t('common.defaultUnit', 'ชิ้น');
    const translatedName = typeof name === 'string' && name.includes('.') ? t(name) : name;
    return [`${formattedVal} ${unit}`, translatedName];
  };
};

/**
 * Helper for Recharts X/Y Axis date/number ticks
 * @param {'date' | 'number'} type
 * @param {string} formatPattern
 * @returns {Function} Tick formatter callback
 */
export const createRechartsAxisFormatter = (type = 'number', formatPattern = 'dd MMM') => {
  return (value) => {
    if (type === 'date') {
      return formatI18nDate(value, formatPattern);
    }
    return formatI18nNumber(value);
  };
};
