import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';

/**
 * Custom hook for managing notifications
 * - Fetches notifications from Firestore
 * - Checks for low stock products
 * - Manages push notification permissions
 */
export const useNotifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pushPermission, setPushPermission] = useState('default');

    // Format time ago helper
    const formatTimeAgo = (dateStr) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        return `${diffDays} วันที่แล้ว`;
    };

    // Fetch notifications from database
    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            const q = query(
                collection(db, 'notifications'),
                orderBy('created_at', 'desc'),
                limit(20)
            );

            const snapshot = await getDocs(q);
            const notifs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            const formattedNotifs = notifs.map(n => ({
                ...n,
                time: formatTimeAgo(n.created_at)
            }));
            setNotifications(formattedNotifs);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Check for low stock products and create notifications
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const checkLowStockProducts = useCallback(async () => {
        try {
            // Firestore doesn't support where('quantity', '<', field('min_threshold'))
            // We fetch products and filter in memory.
            // Assumption: Product catalog is manageable size (< 1000 items)
            const snapshot = await getDocs(collection(db, 'products'));
            const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const lowStock = products.filter(p => {
                const qty = parseInt(p.quantity) || 0;
                const min = parseInt(p.min_threshold) || 0;
                return qty < min;
            });

            if (lowStock && lowStock.length > 0) {
                await createLowStockNotifications(lowStock);
            }
        } catch (err) {
            console.error('Error checking low stock:', err);
        }
    }, []);

    // Create notifications for low stock products
    const createLowStockNotifications = async (products) => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        for (const product of products) {
            // Check if notification already exists for this product (within last 24h)
            // Composite index might be needed: product_id + type + created_at
            // Alternatively, just query by product_id and type, then filter date in JS
            const q = query(
                collection(db, 'notifications'),
                where('product_id', '==', product.id),
                where('type', '==', 'warning')
            );

            const snapshot = await getDocs(q);
            // Filter locally for date to avoid index complexity during migration
            const recentExists = snapshot.docs.some(d => d.data().created_at >= yesterday);

            if (!recentExists) {
                // Create new notification
                await addDoc(collection(db, 'notifications'), {
                    type: 'warning',
                    title: 'สินค้าใกล้หมด',
                    message: `${product.name} เหลือเพียง ${product.quantity} ชิ้น (ต่ำกว่าเกณฑ์ ${product.min_threshold})`,
                    product_id: product.id,
                    read: false,
                    created_at: new Date().toISOString()
                });

                // Show push notification if permission granted
                if (pushPermission === 'granted') {
                    showPushNotification(
                        'สินค้าใกล้หมด! 📦',
                        `${product.name} เหลือเพียง ${product.quantity} ชิ้น`
                    );
                }
            }
        }

        // Refresh notifications list
        await fetchNotifications();
    };

    // Mark single notification as read
    const markAsRead = async (id) => {
        try {
            await updateDoc(doc(db, 'notifications', id), { read: true });
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: true } : n)
            );
        } catch (err) {
            console.error("Error marking as read", err);
        }
    };

    // Mark all notifications as read
    const markAllAsRead = async () => {
        try {
            const unread = notifications.filter(n => !n.read);
            if (unread.length === 0) return;

            const batch = writeBatch(db);
            unread.forEach(n => {
                const ref = doc(db, 'notifications', n.id);
                batch.update(ref, { read: true });
            });
            await batch.commit();

            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (err) {
            console.error("Error marking all as read", err);
        }
    };

    // Delete a notification
    const deleteNotification = async (id) => {
        try {
            await deleteDoc(doc(db, 'notifications', id));
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error("Error deleting notification", err);
        }
    };

    // Clear all notifications
    const clearAllNotifications = async () => {
        try {
            // Deleting all docs in collection requires listing them first.
            // Use batching (max 500)
            const q = query(collection(db, 'notifications'));
            const snapshot = await getDocs(q);

            const batch = writeBatch(db);
            snapshot.docs.forEach(d => {
                batch.delete(d.ref);
            });
            await batch.commit();

            setNotifications([]);
        } catch (err) {
            console.error("Error clearing notifications", err);
        }
    };

    // Request push notification permission
    const requestPushPermission = async () => {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return 'unsupported';
        }

        const permission = await Notification.requestPermission();
        setPushPermission(permission);

        if (permission === 'granted') {
            // Register service worker if not already
            if ('serviceWorker' in navigator) {
                try {
                    await navigator.serviceWorker.register('/service-worker.js');
                } catch (err) {
                    console.error('Service Worker registration failed:', err);
                }
            }
        }

        return permission;
    };

    // Show a push notification
    const showPushNotification = (title, body, options = {}) => {
        if (pushPermission !== 'granted') return;

        const defaultOptions = {
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [200, 100, 200],
            tag: 'stockflow-notification',
            ...options
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // Use service worker to show notification
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title,
                body,
                options: defaultOptions
            });
        } else {
            // Fallback to regular notification
            new Notification(title, {
                body,
                ...defaultOptions
            });
        }
    };

    // Check push permission on mount
    useEffect(() => {
        if ('Notification' in window) {
            setPushPermission(Notification.permission);
        }
    }, []);

    // Fetch notifications and check low stock on mount
    useEffect(() => {
        fetchNotifications();
        checkLowStockProducts();
    }, [fetchNotifications, checkLowStockProducts]);

    // Calculate unread count
    const unreadCount = notifications.filter(n => !n.read).length;

    return {
        notifications,
        loading,
        unreadCount,
        pushPermission,
        fetchNotifications,
        checkLowStockProducts,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        requestPushPermission,
        showPushNotification
    };
};

export default useNotifications;
