const PLACEHOLDER_ONLY_PATTERN = /^[\s\-–—_./?]+$/;

export function isPlaceholderItemValue(value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_ONLY_PATTERN.test(trimmed);
}

export function validateItemEditPayload({ name, unit } = {}) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedUnit = typeof unit === 'string' ? unit.trim() : '';

  const errors = {};
  if (isPlaceholderItemValue(normalizedName)) {
    errors.name = 'invalidName';
  }
  if (isPlaceholderItemValue(normalizedUnit)) {
    errors.unit = 'invalidUnit';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      name: normalizedName,
      unit: normalizedUnit
    }
  };
}
