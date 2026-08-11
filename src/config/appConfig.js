export const APP_CONFIG = {
  name: 'StockFlow',
  subtitle: 'Inventory Management System',
  version: '1.0.0',
  year: new Date().getFullYear(),
  orgName: 'StockFlow Organization',
};

export const updateAppConfig = (brandingSettings) => {
  if (!brandingSettings) return;
  if (brandingSettings.app_name) APP_CONFIG.name = brandingSettings.app_name;
  if (brandingSettings.subtitle) APP_CONFIG.subtitle = brandingSettings.subtitle;
  if (brandingSettings.org_name) APP_CONFIG.orgName = brandingSettings.org_name;
};

