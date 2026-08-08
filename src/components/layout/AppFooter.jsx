import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ShieldCheck, BookOpen } from 'lucide-react';
import { APP_CONFIG } from '@/config/appConfig';
import { supabase } from '@/lib/supabase';

const AppFooter = () => {
  const [footerSettings, setFooterSettings] = useState({
    name: APP_CONFIG.name,
    company: '',
    subtitle: APP_CONFIG.subtitle
  });

  const loadFooterSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_system_settings');

      if (!error && data) {
        setFooterSettings({
          name: data.app_name || APP_CONFIG.name,
          company: data.company_name || '',
          subtitle: data.app_subtitle || APP_CONFIG.subtitle
        });
      }
    } catch (e) {
      // Fall back safely to APP_CONFIG defaults
    }
  };


  useEffect(() => {
    loadFooterSettings();

    const handleSettingsUpdated = () => loadFooterSettings();
    window.addEventListener('stockflow:settings-updated', handleSettingsUpdated);
    return () => window.removeEventListener('stockflow:settings-updated', handleSettingsUpdated);
  }, []);

  return (
    <footer className="relative z-10 w-full border-t border-border/40 bg-background/60 backdrop-blur-md transition-colors duration-200 mt-auto">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        
        {/* Left Section: Branding & Copyright */}
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="font-semibold text-foreground">
            © {APP_CONFIG.year} {footerSettings.name}
          </span>
          <span className="hidden sm:inline-block text-border">•</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {footerSettings.subtitle}
          </span>
          {footerSettings.company && (
            <>
              <span className="hidden sm:inline-block text-border">•</span>
              <span className="text-[11px] font-medium text-foreground/80">
                {footerSettings.company}
              </span>
            </>
          )}
        </div>


        {/* Right Section: Optional Link & Centralized Version Badge */}
        <div className="flex items-center gap-3">
          <NavLink 
            to="/manual" 
            className="hover:text-primary transition-colors flex items-center gap-1 text-[11px] font-medium"
          >
            <BookOpen className="w-3 h-3" aria-hidden="true" />
            <span>คู่มือการใช้งาน</span>
          </NavLink>

          <span className="text-border">•</span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-muted/80 text-muted-foreground border border-border/50">
            v{APP_CONFIG.version}
          </span>
        </div>

      </div>
    </footer>
  );
};

export default AppFooter;
