import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_MAINTENANCE_STATE, MaintenanceContext } from './MaintenanceContext';

const POLL_INTERVAL_MS = 60_000;

export function MaintenanceProvider({ children }) {
  const [maintenance, setMaintenance] = useState(DEFAULT_MAINTENANCE_STATE);
  const [loading, setLoading] = useState(true);

  const refreshMaintenance = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_maintenance_status');
      if (error) {
        // Fail open when migration is not applied yet or transient RPC error occurs
        return;
      }
      if (data && typeof data === 'object') {
        setMaintenance({
          enabled: Boolean(data.enabled),
          message: typeof data.message === 'string' ? data.message : '',
          estimated_end: typeof data.estimated_end === 'string' ? data.estimated_end : '',
        });
      }
    } catch {
      // Fail open on network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMaintenance();

    const handleSettingsUpdated = () => {
      refreshMaintenance();
    };
    const handleFocus = () => {
      refreshMaintenance();
    };

    window.addEventListener('stockflow:settings-updated', handleSettingsUpdated);
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(refreshMaintenance, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener('stockflow:settings-updated', handleSettingsUpdated);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, [refreshMaintenance]);

  return (
    <MaintenanceContext.Provider value={{ maintenance, loading, refreshMaintenance }}>
      {children}
    </MaintenanceContext.Provider>
  );
}
