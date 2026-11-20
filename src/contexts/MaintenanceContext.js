import { createContext, useContext } from 'react';

export const DEFAULT_MAINTENANCE_STATE = {
  enabled: false,
  message: '',
  estimated_end: '',
};

export const MaintenanceContext = createContext({
  maintenance: DEFAULT_MAINTENANCE_STATE,
  loading: false,
  refreshMaintenance: async () => {},
});

export function useMaintenance() {
  return useContext(MaintenanceContext);
}
