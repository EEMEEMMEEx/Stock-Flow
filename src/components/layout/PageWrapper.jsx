import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AppFooter from './AppFooter';
import { useAuth } from '@/contexts/AuthContext';
import ForceChangePasswordModal from '@/components/auth/ForceChangePasswordModal';

const PageWrapper = () => {
  const { user, loading, mustChangePassword, refreshProfile } = useAuth();
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
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip link: keyboard users jump straight to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:flex focus:items-center focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>

      <Sidebar 
        isOpen={isMobileMenuOpen} 
        onClose={closeMobileMenu}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-200 ease-out">
        <Topbar
          isMobileMenuOpen={isMobileMenuOpen}
          isCollapsed={isCollapsed}
          menuButtonRef={menuButtonRef}
          onMenuClick={handleMenuClick}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto flex flex-col justify-between focus:outline-none">
          <div className="p-4 md:p-6 lg:p-8 flex-1">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </div>
          <AppFooter />
        </main>
      </div>

      <ForceChangePasswordModal 
        isOpen={Boolean(user && mustChangePassword)} 
        onPasswordChanged={refreshProfile}
      />
    </div>
  );
};

export default PageWrapper;
