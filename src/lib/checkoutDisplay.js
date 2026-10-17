// Shared formatting for checkout rows/detail views.
// Keeps "empty org/location" handling in one place so list rows never render
// an orphan icon or separator when the data is missing.

export const normalizeText = (value) => String(value ?? '').trim();

export const formatProjectLocation = (project) => {
  const name = normalizeText(project?.name);
  const code = normalizeText(project?.project_code);
  if (!name && !code) return null;
  if (code && name) return `[${code}] ${name}`;
  return code || name;
};

export const resolveCheckoutMeta = (order) => {
  const department = normalizeText(order?.borrower_department) || null;
  const location = formatProjectLocation(order?.projects);
  return {
    department,
    location,
    hasAny: Boolean(department || location),
  };
};
