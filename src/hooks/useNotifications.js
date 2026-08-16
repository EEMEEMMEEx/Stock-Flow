import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 15;

const sortNewestFirst = (items) => [...items].sort(
  (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
);

const isTableNotFoundError = (err) => {
  if (!err) return false;
  const code = String(err.code || '');
  const status = Number(err.status || 0);
  const msg = String(err.message || '');
  return (
    code === 'PGRST204' ||
    code === '42P01' ||
    status === 404 ||
    msg.includes('404') ||
    msg.includes('relation "public.notifications" does not exist') ||
    msg.includes('Could not find the table')
  );
};

export const useNotifications = (userId) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);
  const [tableExists, setTableExists] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id,event_type,title,message,target_path,reference_id,project_id,metadata,read_at,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (queryError) {
      if (isTableNotFoundError(queryError)) {
        setTableExists(false);
        setNotifications([]);
        setError(null);
      } else {
        setError(queryError);
      }
    } else {
      setTableExists(true);
      setNotifications(data || []);
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadNotifications();
    if (!userId || !tableExists) return undefined;

    const channel = supabase
      .channel(`stockflow-notifications:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, () => {
        void loadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId, tableExists]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!tableExists) return { success: true };
    const target = notifications.find((item) => item.id === notificationId);
    if (!target || target.read_at) return { success: true };

    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read_at: readAt } : item
    )));

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', notificationId)
      .is('read_at', null);

    if (updateError) {
      await loadNotifications();
      return { success: false, error: updateError };
    }
    return { success: true };
  }, [loadNotifications, notifications, tableExists]);

  const markAllAsRead = useCallback(async () => {
    if (!tableExists || !userId || !notifications.some((item) => !item.read_at)) return { success: true };

    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', userId)
      .is('read_at', null);

    if (updateError) {
      await loadNotifications();
      return { success: false, error: updateError };
    }
    return { success: true };
  }, [loadNotifications, notifications, userId, tableExists]);

  const approveQuickWithdrawal = useCallback(async (orderId, notificationId, approverName = 'Admin') => {
    try {
      const { data, error } = await supabase.rpc('approve_inventory_request', {
        p_request_id: orderId,
        p_allow_shortage: false,
        p_override_reason: null
      });

      if (error) throw error;

      // Mark notification as read
      if (notificationId) {
        await markAsRead(notificationId);
      }

      // Reload notifications list
      await loadNotifications();

      return { success: true, data, message: data?.message || 'อนุมัติคำขอเบิกจ่ายสำเร็จ' };
    } catch (err) {
      console.error('Quick Approve Error in Notification:', err);
      return { success: false, error: err, message: err.message || 'เกิดข้อผิดพลาดในการอนุมัติ' };
    }
  }, [loadNotifications, markAsRead]);

  const deleteNotification = useCallback(async (notificationId) => {
    if (!tableExists || !notificationId) return { success: true };

    setNotifications((current) => current.filter((item) => item.id !== notificationId));

    const { error: delError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (delError) {
      await loadNotifications();
      return { success: false, error: delError };
    }
    return { success: true };
  }, [loadNotifications, tableExists]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.read_at ? 0 : 1), 0),
    [notifications]
  );

  return {
    notifications: sortNewestFirst(notifications),
    unreadCount,
    loading,
    error,
    reload: loadNotifications,
    markAsRead,
    markAllAsRead,
    approveQuickWithdrawal,
    deleteNotification
  };
};
