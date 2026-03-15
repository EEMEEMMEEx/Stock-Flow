import { useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

/**
 * Hook for managing audit logs
 * Tracks Who, What, When for all data changes
 */
export const useAuditLog = () => {

    /**
     * Log an action to the audit_logs table
     * @param {string} action - 'create', 'update', 'delete'
     * @param {string} entityType - 'product', 'asset', 'transaction', 'user'
     * @param {string} entityId - ID of the entity
     * @param {string} entityName - Name/title of the entity for display
     * @param {object} oldValues - Previous values (for update/delete)
     * @param {object} newValues - New values (for create/update)
     */
    const logAction = useCallback(async (action, entityType, entityId, entityName, oldValues = null, newValues = null) => {
        try {
            // Get current user
            const user = auth.currentUser;

            if (!user) {
                console.warn('No user logged in, skipping audit log');
                return;
            }

            const logEntry = {
                user_id: user.uid,
                user_email: user.email,
                user_name: user.displayName || user.email,
                action,
                entity_type: entityType,
                entity_id: String(entityId),
                entity_name: entityName,
                old_values: oldValues ? JSON.stringify(oldValues) : null,
                new_values: newValues ? JSON.stringify(newValues) : null,
                created_at: new Date().toISOString(),
                user_agent: navigator?.userAgent || null
            };

            await addDoc(collection(db, 'audit_logs'), logEntry);

        } catch (err) {
            console.error('Audit log error:', err);
        }
    }, []);

    /**
     * Fetch audit logs with optional filters
     * Note: Firestore pagination is cursor-based. 
     * For this migration, we'll fetch a larger set (e.g. 1000) and let user filter client-side or use basic date filters.
     * To support exact page numbers without cursors is inefficient in Firestore.
     * We will simulate by fetching 'limit' number of items, but offset is ignored in this simple version
     * unless we implement comprehensive cursor logic.
     * 
     * Updated to fetch recent logs.
     */
    const fetchAuditLogs = useCallback(async (filters = {}) => {
        try {
            const constraints = [
                orderBy('created_at', 'desc')
            ];

            if (filters.entityType && filters.entityType !== 'all') {
                constraints.push(where('entity_type', '==', filters.entityType));
            }
            if (filters.action && filters.action !== 'all') {
                constraints.push(where('action', '==', filters.action));
            }
            if (filters.userId) {
                constraints.push(where('user_id', '==', filters.userId));
            }
            if (filters.startDate) {
                constraints.push(where('created_at', '>=', filters.startDate));
            }
            if (filters.endDate) {
                constraints.push(where('created_at', '<=', filters.endDate));
            }

            // Limit result size for performance
            const fetchLimit = filters.limit || 100;
            constraints.push(limit(fetchLimit));

            const q = query(collection(db, 'audit_logs'), ...constraints);
            const snapshot = await getDocs(q);

            const data = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    ...d,
                    // Parse strings back to objects if needed, though usually display handles string
                    old_values: typeof d.old_values === 'string' ? JSON.parse(d.old_values) : d.old_values,
                    new_values: typeof d.new_values === 'string' ? JSON.parse(d.new_values) : d.new_values
                };
            });

            // Client-side search if needed (Firestore doesn't support substring search easily)
            let filteredData = data;
            if (filters.search) {
                const lowerSearch = filters.search.toLowerCase();
                filteredData = data.filter(item =>
                    (item.entity_name && item.entity_name.toLowerCase().includes(lowerSearch)) ||
                    (item.user_email && item.user_email.toLowerCase().includes(lowerSearch))
                );
            }

            return { data: filteredData, count: filteredData.length };
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            return { data: [], count: 0 };
        }
    }, []);

    /**
     * Export logs to CSV format
     */
    const exportToCSV = useCallback((logs) => {
        const headers = ['วันที่', 'ผู้ใช้', 'อีเมล', 'การกระทำ', 'ประเภท', 'รหัส', 'ชื่อ', 'ค่าเดิม', 'ค่าใหม่'];

        const rows = logs.map(log => [
            format(new Date(log.created_at), 'd MMM yyyy HH:mm', { locale: th }),
            log.user_name || '',
            log.user_email || '',
            getActionLabel(log.action),
            getEntityLabel(log.entity_type),
            log.entity_id || '',
            log.entity_name || '',
            log.old_values ? JSON.stringify(log.old_values) : '',
            log.new_values ? JSON.stringify(log.new_values) : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Add BOM for Thai encoding
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_log_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }, []);

    /**
     * Export logs to PDF format (using jsPDF if available)
     */
    const exportToPDF = useCallback(async (logs) => {
        try {
            const { jsPDF } = await import('jspdf');
            const autoTableModule = await import('jspdf-autotable');
            const autoTable = autoTableModule.default;

            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

            doc.setFontSize(16);
            doc.text('Audit Log Report', 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, 14, 22);

            const tableData = logs.map(log => [
                format(new Date(log.created_at), 'd/M/yy HH:mm'),
                log.user_name || log.user_email || '',
                getActionLabel(log.action),
                getEntityLabel(log.entity_type),
                log.entity_name || '',
                log.old_values ? JSON.stringify(log.old_values).substring(0, 50) : '-',
                log.new_values ? JSON.stringify(log.new_values).substring(0, 50) : '-'
            ]);

            autoTable(doc, {
                startY: 28,
                head: [['Date', 'User', 'Action', 'Type', 'Name', 'Old Values', 'New Values']],
                body: tableData,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [28, 108, 180] }
            });

            doc.save(`audit_log_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
            alert('ไม่สามารถ export PDF ได้ กรุณาใช้ CSV แทน');
        }
    }, []);

    return {
        logAction,
        fetchAuditLogs,
        exportToCSV,
        exportToPDF
    };
};

// Helper functions
const getActionLabel = (action) => {
    const labels = {
        create: 'สร้าง',
        update: 'แก้ไข',
        delete: 'ลบ'
    };
    return labels[action] || action;
};

const getEntityLabel = (entityType) => {
    const labels = {
        product: 'อุปกรณ์',
        asset: 'ครุภัณฑ์',
        transaction: 'การเบิก',
        user: 'ผู้ใช้'
    };
    return labels[entityType] || entityType;
};

export default useAuditLog;
