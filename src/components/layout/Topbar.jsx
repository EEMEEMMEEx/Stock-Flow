import React, { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, ChevronDown, CircleAlert, ClipboardCheck, ClipboardPlus,
  FileClock, HelpCircle, LogOut, Menu, Moon, PackageCheck, RefreshCw,
  Settings, ShieldCheck, Sun, UserRound, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/theme-provider';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const controlClassName = 'h-11 w-11 shrink-0 rounded-xl border border-[var(--glass-input-border)] bg-[var(--glass-input-bg)] text-[var(--glass-text)] shadow-sm transition-all duration-200 hover:bg-[var(--glass-hover)] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-none';
const menuContentClassName = 'z-50 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--glass-card-border)] bg-[var(--glass-card-bg)] p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';
const menuItemClassName = 'flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors hover:bg-[var(--glass-hover)] focus:bg-[var(--glass-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const getInitial = (name, email) => (name || email || 'U').trim().charAt(0).toUpperCase() || 'U';

const formatRelativeTime = (timestamp) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return 'เมื่อสักครู่';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(seconds / 86400)} วันที่แล้ว`;
};

const notificationPresentation = (eventType) => {
  switch (eventType) {
    case 'withdrawal.submitted':
      return { icon: ClipboardPlus, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
    case 'withdrawal.approved':
      return { icon: ClipboardCheck, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
    case 'withdrawal.rejected':
      return { icon: CircleAlert, className: 'bg-destructive/15 text-destructive' };
    case 'withdrawal.completed':
      return { icon: PackageCheck, className: 'bg-primary/15 text-primary' };
    default:
      return { icon: FileClock, className: 'bg-muted text-muted-foreground' };
  }
};

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

const Topbar = ({ onMenuClick, menuButtonRef, isMobileMenuOpen, isCollapsed }) => {
  const navigate = useNavigate();
  const { profile, user, signOut, can } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    notifications, unreadCount, loading, error, reload, markAsRead, markAllAsRead
  } = useNotifications(user?.id);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const roleLabel = profile?.roles?.code || profile?.role || 'STAFF';
  const canOpenWithdrawals = can('withdrawals.view');
  const themeLabel = resolvedTheme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';

  const notificationList = useMemo(() => notifications.slice(0, 15), [notifications]);

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  const handleNotificationSelect = async (notification) => {
    await markAsRead(notification.id);
    setNotificationOpen(false);
    if (notification.target_path === '/withdrawals' && canOpenWithdrawals) {
      navigate(notification.target_path);
    }
  };

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    const { error: signOutError } = await signOut();
    if (!signOutError) navigate('/login', { replace: true });
  };

  const openNotifications = (open) => {
    setNotificationOpen(open);
    if (open) setUserMenuOpen(false);
  };

  const openUserMenu = (open) => {
    setUserMenuOpen(open);
    if (open) setNotificationOpen(false);
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

        <DropdownMenu.Root open={notificationOpen} onOpenChange={openNotifications}>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              title="แจ้งเตือน"
              aria-label="แจ้งเตือน"
              aria-haspopup="menu"
              aria-expanded={notificationOpen}
              className={cn(controlClassName, 'relative')}
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75" aria-hidden="true">{unreadLabel}</span>
              )}
              {unreadCount > 0 && <span className="sr-only">มีการแจ้งเตือนที่ยังไม่ได้อ่าน {unreadCount} รายการ</span>}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={10} className={menuContentClassName} aria-label="รายการแจ้งเตือน">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <DropdownMenu.Label className="p-0 text-sm font-semibold">แจ้งเตือน</DropdownMenu.Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{unreadCount > 0 ? `ยังไม่ได้อ่าน ${unreadCount} รายการ` : 'ไม่มีรายการที่ยังไม่ได้อ่าน'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={unreadCount === 0}
                  onClick={() => void markAllAsRead()}
                  className="h-9 rounded-lg px-2.5 text-xs text-primary hover:bg-primary/10"
                >
                  <CheckCheck className="mr-1.5 h-4 w-4" />
                  อ่านทั้งหมด
                </Button>
              </div>
              <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border/70" />
              <div className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain px-1 py-1">
                {loading && <div className="px-3 py-8 text-center text-sm text-muted-foreground">กำลังโหลดการแจ้งเตือน…</div>}
                {!loading && error && (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-destructive">ไม่สามารถโหลดการแจ้งเตือนได้</p>
                    <Button variant="ghost" size="sm" type="button" onClick={() => void reload()} className="mt-2 h-9 text-primary">
                      <RefreshCw className="mr-1.5 h-4 w-4" />ลองใหม่
                    </Button>
                  </div>
                )}
                {!loading && !error && notificationList.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">ไม่มีการแจ้งเตือนใหม่</div>
                )}
                {!loading && !error && notificationList.map((notification) => {
                  const presentation = notificationPresentation(notification.event_type);
                  const Icon = presentation.icon;
                  const reference = [notification.metadata?.request_no, notification.metadata?.project_code || notification.metadata?.project_name].filter(Boolean).join(' · ');
                  return (
                    <DropdownMenu.Item
                      key={notification.id}
                      className={cn(menuItemClassName, !notification.read_at && 'bg-primary/5')}
                      onSelect={() => void handleNotificationSelect(notification)}
                    >
                      <span className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', presentation.className)}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2"><span className="line-clamp-1 font-semibold text-foreground">{notification.title}</span>{!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="ยังไม่ได้อ่าน" />}</span>
                        {reference && <span className="mt-0.5 block truncate text-xs font-medium text-primary">{reference}</span>}
                        <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.message}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelativeTime(notification.created_at)}</span>
                      </span>
                    </DropdownMenu.Item>
                  );
                })}
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root open={userMenuOpen} onOpenChange={openUserMenu}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="flex h-11 max-w-[13rem] items-center gap-2 rounded-xl border border-[var(--glass-input-border)] bg-[var(--glass-input-bg)] px-1.5 pr-2 text-left text-[var(--glass-text)] shadow-sm transition-all duration-200 hover:bg-[var(--glass-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-none" aria-label="เมนูผู้ใช้งาน" aria-haspopup="menu" aria-expanded={userMenuOpen}>
              <Avatar profile={profile} user={user} className="h-8 w-8 shrink-0 text-sm" />
              <span className="hidden min-w-0 flex-1 lg:block"><span className="block truncate text-xs font-semibold">{profile?.full_name || user?.email || 'ผู้ใช้งาน'}</span><span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-muted-foreground">{roleLabel}</span></span>
              <ChevronDown className={cn('hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 sm:block', userMenuOpen && 'rotate-180')} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={10} className={cn(menuContentClassName, 'w-[min(20rem,calc(100vw-1.5rem))]')} aria-label="เมนูผู้ใช้งาน">
              <div className="flex items-center gap-3 px-3 py-3">
                <Avatar profile={profile} user={user} className="h-10 w-10 shrink-0 text-base" />
                <div className="min-w-0"><DropdownMenu.Label className="truncate p-0 text-sm font-semibold">{profile?.full_name || user?.email || 'ผู้ใช้งาน'}</DropdownMenu.Label><p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email || ''}</p><span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{roleLabel}</span></div>
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
