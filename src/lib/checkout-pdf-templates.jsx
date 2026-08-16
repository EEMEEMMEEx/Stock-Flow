import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

// Register Thai Font (THSarabunNew)
Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew Italic.ttf', fontStyle: 'italic' },
    { src: '/fonts/THSarabunNew Bold.ttf', fontWeight: 'bold' },
    { src: '/fonts/THSarabunNew BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' }
  ]
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    padding: '10mm 15mm 20mm 15mm',
    fontSize: 12,
    color: '#1e293b',
    backgroundColor: '#fff',
    position: 'relative'
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#6366f1',
    paddingBottom: 8,
  },
  logo: {
    height: 50,
    width: 120,
    objectFit: 'contain',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  docTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4338ca',
    marginTop: 2,
  },
  docNumberBox: {
    textAlign: 'right',
    minWidth: 140,
  },
  docNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  dateText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  infoCol: {
    flex: 1,
    paddingRight: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    width: 90,
  },
  infoValue: {
    fontSize: 11,
    color: '#0f172a',
    flex: 1,
  },
  table: {
    width: '100%',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4338ca',
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  colNo: { width: '6%', textAlign: 'center' },
  colItem: { width: '38%', paddingLeft: 4 },
  colSerial: { width: '22%', textAlign: 'center' },
  colQty: { width: '12%', textAlign: 'right', paddingRight: 4 },
  colCondition: { width: '12%', textAlign: 'center' },
  colStatus: { width: '10%', textAlign: 'center' },
  remarkBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 6,
    marginBottom: 14,
  },
  remarkLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 2,
  },
  remarkValue: {
    fontSize: 11,
    color: '#334155',
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 10,
  },
  signatureBox: {
    width: '45%',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 6,
  },
  sigName: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 4,
  },
  sigRole: {
    fontSize: 10,
    color: '#64748b',
  },
  sigDate: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  }
});

/**
 * Material Checkout Voucher (ใบยืมเครื่องมือ / วัสดุอุปกรณ์)
 */
export const MaterialCheckoutPDF = ({ order }) => {
  if (!order) return null;

  const checkoutItems = order.checkout_items || [];
  const projectCode = order.projects?.project_code || '';
  const projectName = order.projects?.name || '-';
  const projectDisplay = projectCode ? `${projectCode} — ${projectName}` : projectName;

  const formatThaiDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear() + 543}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Image src="/forth-logo.png" style={styles.logo} />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.companyName}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
            <Text style={styles.docTitle}>ใบยืมเครื่องมือ / วัสดุอุปกรณ์ (Material Checkout Voucher)</Text>
          </View>
          <View style={styles.docNumberBox}>
            <Text style={styles.docNumberText}>เลขที่: {order.order_number || '-'}</Text>
            <Text style={styles.dateText}>วันที่ยืม: {formatThaiDate(order.checkout_date)}</Text>
            <Text style={{ ...styles.dateText, color: '#dc2626', fontWeight: 'bold' }}>
              กำหนดคืน: {formatThaiDate(order.expected_return_date)}
            </Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ชื่อผู้ยืม:</Text>
              <Text style={styles.infoValue}>{order.borrower_name || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>แผนก / หน่วยงาน:</Text>
              <Text style={styles.infoValue}>{order.borrower_department || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>เบอร์โทรศัพท์:</Text>
              <Text style={styles.infoValue}>{order.borrower_phone || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>คลัง/โครงการต้นทาง:</Text>
              <Text style={styles.infoValue}>{projectDisplay}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>สถานที่นำไปใช้งาน:</Text>
              <Text style={styles.infoValue}>{order.projects?.location || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>วัตถุประสงค์การยืม:</Text>
              <Text style={styles.infoValue}>{order.purpose || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colNo}>ลำดับ</Text>
            <Text style={styles.colItem}>รายการอุปกรณ์ / วัสดุ</Text>
            <Text style={styles.colSerial}>Serial Number / รหัสอุปกรณ์</Text>
            <Text style={styles.colQty}>จำนวนที่ยืม</Text>
            <Text style={styles.colCondition}>สภาพตอนยืม</Text>
            <Text style={styles.colStatus}>สถานะ</Text>
          </View>

          {checkoutItems.map((item, index) => (
            <View key={item.id || index} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colItem}>{item.items?.name || item.item_name || 'รายการอุปกรณ์'}</Text>
              <Text style={styles.colSerial}>{item.serial_number || '-'}</Text>
              <Text style={styles.colQty}>{item.quantity_borrowed} {item.items?.unit || 'ชิ้น'}</Text>
              <Text style={styles.colCondition}>{item.condition_on_checkout === 'normal' ? 'ปกติ' : item.condition_on_checkout || 'ปกติ'}</Text>
              <Text style={styles.colStatus}>{item.status === 'returned' ? 'คืนแล้ว' : 'กำลังยืม'}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        {order.notes && (
          <View style={styles.remarkBox}>
            <Text style={styles.remarkLabel}>หมายเหตุเพิ่มเติม:</Text>
            <Text style={styles.remarkValue}>{order.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order.borrower_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>ผู้ขอยืมพัสดุ / ช่างผู้เบิก</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order.profiles?.full_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>เจ้าหน้าที่ผู้จ่ายพัสดุ / เจ้าหน้าที่คลัง</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

/**
 * Material Return Receipt (ใบรับคืนเครื่องมือ / วัสดุอุปกรณ์)
 */
export const MaterialReturnPDF = ({ order, returnLogs = [] }) => {
  if (!order) return null;

  const checkoutItems = order.checkout_items || [];
  const projectCode = order.projects?.project_code || '';
  const projectName = order.projects?.name || '-';
  const projectDisplay = projectCode ? `${projectCode} — ${projectName}` : projectName;

  const formatThaiDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear() + 543}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Image src="/forth-logo.png" style={styles.logo} />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.companyName}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
            <Text style={{ ...styles.docTitle, color: '#059669' }}>ใบรับคืนเครื่องมือ / วัสดุอุปกรณ์ (Material Return Receipt)</Text>
          </View>
          <View style={styles.docNumberBox}>
            <Text style={styles.docNumberText}>อ้างอิงใบยืม: {order.order_number || '-'}</Text>
            <Text style={styles.dateText}>วันที่ยืม: {formatThaiDate(order.checkout_date)}</Text>
            <Text style={{ ...styles.dateText, color: '#059669', fontWeight: 'bold' }}>
              วันที่รับคืน: {formatThaiDate(order.actual_returned_date || new Date())}
            </Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ผู้ส่งคืน:</Text>
              <Text style={styles.infoValue}>{order.borrower_name || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>แผนก / หน่วยงาน:</Text>
              <Text style={styles.infoValue}>{order.borrower_department || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>คลังจัดเก็บปลายทาง:</Text>
              <Text style={styles.infoValue}>{projectDisplay}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>สถานะการคืน:</Text>
              <Text style={{ ...styles.infoValue, fontWeight: 'bold', color: order.status === 'completed' ? '#059669' : '#d97706' }}>
                {order.status === 'completed' ? 'คืนครบถ้วน (Completed)' : 'คืนบางส่วน (Partial)'}
              </Text>
            </View>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={{ ...styles.tableHeader, backgroundColor: '#059669' }}>
            <Text style={styles.colNo}>ลำดับ</Text>
            <Text style={styles.colItem}>รายการอุปกรณ์ / วัสดุ</Text>
            <Text style={styles.colSerial}>Serial Number</Text>
            <Text style={{ ...styles.colQty, width: '10%' }}>ยืมไป</Text>
            <Text style={{ ...styles.colQty, width: '10%' }}>คืนแล้ว</Text>
            <Text style={{ ...styles.colQty, width: '10%' }}>ชำรุด/สูญหาย</Text>
            <Text style={{ ...styles.colStatus, width: '14%' }}>สภาพรับคืน</Text>
          </View>

          {checkoutItems.map((item, index) => (
            <View key={item.id || index} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colItem}>{item.items?.name || 'รายการอุปกรณ์'}</Text>
              <Text style={styles.colSerial}>{item.serial_number || '-'}</Text>
              <Text style={{ ...styles.colQty, width: '10%' }}>{item.quantity_borrowed}</Text>
              <Text style={{ ...styles.colQty, width: '10%', color: '#059669', fontWeight: 'bold' }}>{item.quantity_returned}</Text>
              <Text style={{ ...styles.colQty, width: '10%', color: item.quantity_damaged > 0 || item.quantity_lost > 0 ? '#dc2626' : '#64748b' }}>
                {Number(item.quantity_damaged) + Number(item.quantity_lost)}
              </Text>
              <Text style={{ ...styles.colStatus, width: '14%' }}>
                {item.quantity_damaged > 0 ? 'ชำรุด' : item.quantity_lost > 0 ? 'สูญหาย' : 'ปกติสมบูรณ์'}
              </Text>
            </View>
          ))}
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order.borrower_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>ผู้ส่งคืนพัสดุ</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order.profiles?.full_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>ผู้ตรวจรับคืน / เจ้าหน้าที่คลัง</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
