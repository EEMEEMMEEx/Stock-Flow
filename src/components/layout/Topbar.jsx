import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown, HelpCircle, LogOut, Menu, Moon, 
  Settings, ShieldCheck, Sun, UserRound
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NotificationBell from './NotificationBell';
import RoleBadge, { getRoleLabel, getRoleTextColorClass } from '@/components/ui/RoleBadge';

const controlClassName = 'h-11 w-11 shrink-0 rounded-xl border border-[var(--glass-input-border)] bg-[var(--glass-input-bg)] text-[var(--glass-text)] shadow-sm transition-all duration-200 hover:bg-[var(--glass-hover)] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-none';
const menuContentClassName = 'z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--glass-card-border)] bg-[var(--glass-card-bg)] p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';
const menuItemClassName = 'flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors hover:bg-[var(--glass-hover)] focus:bg-[var(--glass-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const getInitial = (name, email) => (name || email || 'U').trim().charAt(0).toUpperCase() || 'U';

const Avatar = ({ profile, user, className = '' }) => profile?.avatar_url ? (
  <img
    src={profile.avatar_url}
    alt={profile.full_name || user?.email || 'ผู้ใช้งาน'}
    className={cn('rounded-full border border-[var(--glass-card-border)] object-cover', className)}
  />
) : (
  <span className={cn('inline-flex items-center justify-center rounded-full bg-primary/15 font-semibold text-primary', className)}>
    {getInitial(profile?.full_name, user?.email)}
  </span>
);

const Topbar = ({ onMenuClick, menuButtonRef, isMobileMenuOpen }) => {
  const navigate = useNavigate();
  const { profile, user, signOut, can } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const roleLabel = getRoleLabel(profile?.roles?.code || profile?.role || 'STAFF', profile?.roles?.name);
  const roleColorClass = getRoleTextColorClass(profile?.roles?.code || profile?.role || 'STAFF', profile?.roles?.name);
  const themeLabel = resolvedTheme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    const { error: signOutError } = await signOut();
    if (!signOutError) navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--glass-card-border)] bg-[var(--glass-card-bg)] px-3 shadow-sm backdrop-blur-xl transition-colors sm:px-4 md:px-6">
      {/* Left side: Mobile Navigation Drawer Trigger (Visible ONLY on Mobile < md) */}
      <div className="flex items-center gap-2 md:hidden">
        <Button
          ref={menuButtonRef}
          variant="ghost"
          size="icon"
          type="button"
          title={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={isMobileMenuOpen}
          aria-controls="stockflow-sidebar"
          onClick={onMenuClick}
          className={controlClassName}
        >
          <Menu className="h-[19px] w-[19px]" />
        </Button>
      </div>

      {/* Right side: Global Actions & User Profile Dropdown */}
      <div className="flex items-center gap-2 ml-auto" aria-label="การควบคุมส่วนหัว">
        {/* Dark/Light Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title={themeLabel}
          aria-label={themeLabel}
          aria-pressed={resolvedTheme === 'dark'}
          onClick={toggleTheme}
          className={controlClassName}
        >
          {resolvedTheme === 'dark' ? <Sun className="h-[18px] w-[18px] transition-transform duration-200" /> : <Moon className="h-[18px] w-[18px] transition-transform duration-200" />}
          <span className="sr-only">ธีมปัจจุบัน: {theme === 'system' ? 'ตามระบบ' : resolvedTheme === 'dark' ? 'มืด' : 'สว่าง'}</span>
        </Button>

        {/* Interactive In-App Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <DropdownMenu.Root open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="flex h-11 max-w-[13rem] items-center gap-2 rounded-xl border border-[var(--glass-input-border)] bg-[var(--glass-input-bg)] px-1.5 pr-2 text-left text-[var(--glass-text)] shadow-sm transition-all duration-200 hover:bg-[var(--glass-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-none cursor-pointer" aria-label="เมนูผู้ใช้งาน" aria-haspopup="menu" aria-expanded={userMenuOpen}>
              <Avatar profile={profile} user={user} className="h-8 w-8 shrink-0 text-sm" />
              <span className="hidden min-w-0 flex-1 lg:block"><span className="block truncate text-xs font-semibold">{profile?.full_name || user?.email || 'ผู้ใช้งาน'}</span><span className={cn("mt-0.5 block truncate text-[10px] uppercase tracking-wide font-bold", roleColorClass)}>{roleLabel}</span></span>
              <ChevronDown className={cn('hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 sm:block', userMenuOpen && 'rotate-180')} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={10} className={menuContentClassName} aria-label="เมนูผู้ใช้งาน">
              <div className="flex items-center gap-3 px-3 py-3">
                <Avatar profile={profile} user={user} className="h-10 w-10 shrink-0 text-base" />
                <div className="min-w-0">
                  <DropdownMenu.Label className="truncate p-0 text-sm font-semibold">{profile?.full_name || user?.email || 'ผู้ใช้งาน'}</DropdownMenu.Label>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email || ''}</p>
                  <div className="mt-1">
                    <RoleBadge role={profile?.roles?.code || profile?.role || 'STAFF'} roleName={profile?.roles?.name} roleObj={profile?.roles} size="sm" />
                  </div>
                </div>
              </div>
              <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border/70" />
              <DropdownMenu.Item asChild className={menuItemClassName}><Link to="/profile"><UserRound className="h-4 w-4 text-primary" />โปรไฟล์</Link></DropdownMenu.Item>
              <DropdownMenu.Item asChild className={menuItemClassName}><Link to="/profile?tab=password"><ShieldCheck className="h-4 w-4 text-primary" />ความปลอดภัยและรหัสผ่าน</Link></DropdownMenu.Item>
              <DropdownMenu.Item asChild className={menuItemClassName}><Link to="/manual"><HelpCircle className="h-4 w-4 text-primary" />คู่มือการใช้งาน</Link></DropdownMenu.Item>
              {can('settings.view') && <DropdownMenu.Item asChild className={menuItemClassName}><Link to="/settings"><Settings className="h-4 w-4 text-primary" />ตั้งค่าระบบ</Link></DropdownMenu.Item>}
              <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border/70" />
              <DropdownMenu.Item className={cn(menuItemClassName, 'text-destructive focus:bg-destructive/10 focus:text-destructive')} onSelect={() => void handleSignOut()}><LogOut className="h-4 w-4" />ออกจากระบบ</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
};

export default Topbar;
