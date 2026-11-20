import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AppFooter from './AppFooter';
import InstallPrompt from '@/components/InstallPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { useTranslation } from '@/i18n';
import StockFlowCopilotFab from '@/components/copilot/StockFlowCopilotFab';

const ForceChangePasswordModal = lazy(() => import('@/components/auth/ForceChangePasswordModal'));

const PageWrapper = () => {
  const { user, loading, mustChangePassword, refreshProfile, isSuperAdmin } = useAuth();
  const { maintenance } = useMaintenance();
  const { t } = useTranslation();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Lifted Desktop Collapsed State with LocalStorage Persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('stockflow.sidebar.collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const menuButtonRef = useRef(null);
  const wasMobileMenuOpen = useRef(false);

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stockflow.sidebar.collapsed', String(next));
      } catch (e) {
        console.error('Failed to save sidebar collapsed state', e);
      }
      return next;
    });
  }, []);

  const handleMenuClick = useCallback(() => {
    // If screen width is mobile (< 768px), open mobile drawer; otherwise toggle collapse
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen((open) => !open);
    } else {
      toggleCollapse();
    }
  }, [toggleCollapse]);

  useEffect(() => {
    if (wasMobileMenuOpen.current && !isMobileMenuOpen) {
      menuButtonRef.current?.focus();
    }
    wasMobileMenuOpen.current = isMobileMenuOpen;
  }, [isMobileMenuOpen]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background transition-colors duration-300 ease-in-out motion-reduce:transition-none">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground transition-colors duration-300 ease-in-out motion-reduce:transition-none">
      <Sidebar 
        isOpen={isMobileMenuOpen} 
        onClose={closeMobileMenu}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative transition-colors duration-300 ease-in-out motion-reduce:transition-none">
        <Topbar
          isMobileMenuOpen={isMobileMenuOpen}
          isCollapsed={isCollapsed}
          menuButtonRef={menuButtonRef}
          onMenuClick={handleMenuClick}
        />
        {maintenance.enabled && isSuperAdmin && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 font-medium">
              <Wrench className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('maintenance.superBanner', 'Maintenance Mode is ACTIVE — Regular users are blocked from accessing the system.')}
              </span>
            </div>
            <Link
              to="/settings"
              className="font-semibold underline underline-offset-2 hover:opacity-80 shrink-0"
            >
              {t('maintenance.manageInSettings', 'Manage')}
            </Link>
          </div>
        )}
        <main className="flex-1 overflow-y-auto flex flex-col justify-between">
          <div className="p-3 sm:p-4 md:p-6 lg:p-8 flex-1">
            <div className="mx-auto max-w-384">
              <Outlet />
            </div>
          </div>
          <AppFooter />
        </main>
      </div>

      {Boolean(user && mustChangePassword) && (
        <Suspense fallback={null}>
          <ForceChangePasswordModal 
            isOpen={true} 
            onPasswordChanged={refreshProfile}
          />
        </Suspense>
      )}
      <InstallPrompt />
      <StockFlowCopilotFab />
    </div>
  );
};

export default PageWrapper;
