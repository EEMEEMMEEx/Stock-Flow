import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, CircleAlert, ClipboardCheck, ClipboardPlus,
  FileClock, PackageCheck, RefreshCw, Check, ArrowRight,
  RotateCcw, AlertTriangle, Package, Trash2, ShieldCheck, Clock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const controlClassName = 'h-9 w-9 shrink-0 rounded-lg border border-input bg-background text-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer';
const menuContentClassName = 'z-50 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

const notificationPresentation = (eventType) => {
  switch (eventType) {
    case 'withdrawal.submitted':
    case 'withdrawal_submitted':
      return { 
        icon: ClipboardPlus, 
        className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20',
        badge: 'New Withdrawal Request',
        badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      };
    case 'withdrawal.approved':
    case 'withdrawal_approved':
      return { 
        icon: ClipboardCheck, 
        className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
        badge: 'Approved',
        badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      };
    case 'withdrawal.rejected':
    case 'withdrawal_rejected':
      return { 
        icon: CircleAlert, 
        className: 'bg-destructive/15 text-destructive border-destructive/20',
        badge: 'Rejected',
        badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      };
    case 'withdrawal.completed':
    case 'withdrawal_completed':
      return { 
        icon: PackageCheck, 
        className: 'bg-primary/15 text-primary border-primary/20',
        badge: 'Received',
        badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
      };
    case 'checkout.overdue':
    case 'checkout_overdue':
      return { 
        icon: RotateCcw, 
        className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20',
        badge: 'Overdue',
        badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
      };
    case 'stock.low_stock':
    case 'low_stock_alert':
      return { 
        icon: AlertTriangle, 
        className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/20',
        badge: 'Critical Stock',
        badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
      };
    default:
      return { 
        icon: FileClock, 
        className: 'bg-muted text-muted-foreground border-border/20',
        badge: 'Alert',
        badgeClass: 'bg-muted text-muted-foreground'
      };
  }
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const { user, profile, can } = useAuth();
  const {
    notifications, unreadCount, loading, error, reload, markAsRead, markAllAsRead,
    approveQuickWithdrawal, deleteNotification
  } = useNotifications(user?.id);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread' | 'action'
  const [approvingId, setApprovingId] = useState(null);

  const canApproveWithdrawals = can('withdrawals.approve');
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  // Filter notifications based on active tab
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter(n => !n.read_at);
    }
    if (activeTab === 'action') {
      return notifications.filter(n => {
        const type = n.event_type || '';
        return (
          type.includes('submitted') ||
          type.includes('overdue') ||
          type.includes('low_stock')
        );
      });
    }
    return notifications;
  }, [notifications, activeTab]);

  const pendingActionCount = useMemo(() => {
    return notifications.filter(n => {
      const type = n.event_type || '';
      return (
        !n.read_at &&
        (type.includes('submitted') || type.includes('overdue') || type.includes('low_stock'))
      );
    }).length;
  }, [notifications]);

  const handleOpenChange = (open) => {
    setIsOpen(open);
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.read_at) {
      await markAsRead(notification.id);
    }
    setIsOpen(false);

    if (notification.target_path) {
      navigate(notification.target_path);
    } else if (notification.event_type?.includes('withdrawal')) {
      navigate('/withdrawals');
    } else if (notification.event_type?.includes('checkout')) {
      navigate('/checkouts');
    }
  };

  // Quick Action Handler: Instant Approve from Notification Popover
  const handleQuickApprove = async (e, notification) => {
    e.stopPropagation();
    const orderId = notification.reference_id;
    if (!orderId || approvingId) return;

    try {
      setApprovingId(notification.id);
      const toastId = toast.loading('Approving requisition and deducting stock...');

      const result = await approveQuickWithdrawal(orderId, notification.id, profile?.full_name || 'Admin');

      if (!result.success) {
        toast.dismiss(toastId);
        const errorMsg = result.message || '';
        if (errorMsg.includes('SHORTAGE_DETECTED')) {
          toast.error('Insufficient stock found. Please check in the requisition management page.');
          setIsOpen(false);
          navigate('/withdrawals');
          return;
        }
        toast.error(errorMsg || 'Failed to approve request');
        return;
      }

      toast.success(result.message || 'Withdrawal request approved successfully', { id: toastId });
    } catch (err) {
      console.error('Quick approve exception:', err);
      toast.error('Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (e, notificationId) => {
    e.stopPropagation();
    await deleteNotification(notificationId);
    toast.success('Notification removed');
  };

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Notifications"
          aria-label="Notifications"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={cn(controlClassName, 'relative cursor-pointer')}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full border-2 border-background bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white shadow-md motion-safe:animate-pulse"
              aria-hidden="true"
            >
              {unreadLabel}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="sr-only">You have {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}</span>
          )}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className={menuContentClassName}
          aria-label="Notification Center"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <DropdownMenu.Label className="p-0 text-sm font-bold text-foreground">
                  Notifications
                </DropdownMenu.Label>
                <p className="text-[11px] text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => void markAllAsRead()}
                className="h-8 rounded-lg px-2 text-xs text-primary hover:bg-primary/10 font-semibold flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all as read</span>
              </Button>
            )}
          </div>

          {/* Filter Tabs Pills */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-semibold my-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                'py-1.5 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer',
                activeTab === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>All</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded-full font-mono">
                {notifications.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={cn(
                'py-1.5 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer',
                activeTab === 'unread'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-mono">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('action')}
              className={cn(
                'py-1.5 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer',
                activeTab === 'action'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>Action Needed</span>
              {pendingActionCount > 0 && (
                <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.2 rounded-full font-mono animate-pulse">
                  {pendingActionCount}
                </span>
              )}
            </button>
          </div>

          <DropdownMenu.Separator className="my-1.5 h-px bg-border/50" />

          {/* Notifications Scrollable List */}
          <div className="max-h-[min(26rem,calc(100vh-12rem))] overflow-y-auto overscroll-contain space-y-1.5 px-1 py-1 pr-1.5">
            {loading && (
              <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading notifications...</span>
              </div>
            )}

            {!loading && error && (
              <div className="py-8 text-center px-4 space-y-2">
                <p className="text-xs text-destructive font-medium">Failed to load notifications</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reload()}
                  className="h-8 text-xs"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            )}

            {!loading && !error && filteredNotifications.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="font-semibold text-foreground">No notifications in this tab</div>
                <p className="text-[11px] text-muted-foreground">You are all caught up.</p>
              </div>
            )}

            {!loading && !error && filteredNotifications.map((notification) => {
              const presentation = notificationPresentation(notification.event_type);
              const Icon = presentation.icon;
              const isUnread = !notification.read_at;
              const isSubmitted = notification.event_type?.includes('submitted');
              const isOverdue = notification.event_type?.includes('overdue');
              const isApproved = notification.event_type?.includes('approved');
              const isLowStock = notification.event_type?.includes('low_stock');
              const isApproving = approvingId === notification.id;

              const reference = [
                notification.metadata?.request_no,
                notification.metadata?.project_code || notification.metadata?.project_name
              ].filter(Boolean).join(' · ');

              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    'group relative rounded-xl border p-3 transition-all duration-200 cursor-pointer text-left',
                    isUnread
                      ? 'bg-primary/5 dark:bg-primary/10 border-primary/30 shadow-sm'
                      : 'bg-background/40 hover:bg-black/5 dark:hover:bg-white/5 border-border/40'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Icon */}
                    <div className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', presentation.className)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn('inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold', presentation.badgeClass)}>
                          {presentation.badge}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(notification.created_at)}
                          </span>

                          <button
                            type="button"
                            title="Delete notification"
                            onClick={(e) => handleDelete(e, notification.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 rounded transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="font-semibold text-xs text-foreground line-clamp-1">
                        {notification.title}
                      </div>

                      {reference && (
                        <div className="text-[11px] font-mono font-medium text-primary line-clamp-1">
                          {reference}
                        </div>
                      )}

                      <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>

                      {/* Interactive Quick Actions Toolbar */}
                      <div className="pt-1 flex flex-wrap items-center gap-1.5 mt-1.5 border-t border-border/20">
                        {/* 1. Quick Instant Approve for Supervisor / Admin */}
                        {isSubmitted && canApproveWithdrawals && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isApproving}
                              onClick={(e) => handleQuickApprove(e, notification)}
                              className="h-7 px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-xs"
                            >
                              {isApproving ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              <span>{isApproving ? 'Approving...' : 'Quick Approve'}</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notification);
                              }}
                              className="h-7 px-2 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground"
                            >
                              View Requisition
                            </Button>
                          </>
                        )}

                        {/* 2. Staff view voucher button when approved */}
                        {isApproved && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(notification);
                            }}
                            className="h-7 px-2.5 text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-1 shadow-xs"
                          >
                            <span>View Voucher</span>
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}

                        {/* 3. Checkout Overdue action */}
                        {isOverdue && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(notification);
                            }}
                            className="h-7 px-2.5 text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-1 shadow-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Process Return</span>
                          </Button>
                        )}

                        {/* 4. Low stock check */}
                        {isLowStock && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(notification);
                            }}
                            className="h-7 px-2.5 text-[11px] font-medium flex items-center gap-1"
                          >
                            <Package className="w-3 h-3 text-orange-500" />
                            <span>Check Stock</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default NotificationBell;
