/**
 * Resolves the defective item's serial number from a checkout return log.
 * - For condition 'consumed': the defective returned unit's serial is stored strictly in `replaced_serial_number`.
 *   (The `checkout_items.serial_number` represents the new installed replacement unit, NOT the defective one).
 * - For conditions 'damaged', 'needs_repair': defaults to `replaced_serial_number` if present,
 *   otherwise falls back to `checkout_items.serial_number`.
 *
 * @param {Object} log - Checkout return log record
 * @returns {string} - Defective serial number string or empty string
 */
export const resolveDefectiveSerial = (log) => {
  if (!log) return '';
  const returned = (log.returned_serial_number || '').trim();
  const replaced = (log.replaced_serial_number || '').trim();
  if (log.item_condition === 'consumed') {
    return returned || replaced || '';
  }
  const original = (log.checkout_items?.serial_number || '').trim();
  return returned || replaced || original || '';
};

/**
 * Formats the defective serial number for display in tables or modals.
 * @param {Object} log
 * @param {string} [fallback='-']
 * @returns {string}
 */
export const formatDefectiveSerial = (log, fallback = '-') => {
  const serial = resolveDefectiveSerial(log);
  return serial || fallback;
};
