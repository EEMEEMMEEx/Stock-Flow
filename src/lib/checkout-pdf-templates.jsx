import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

// Register Thai Font (THSarabunNew) - Identical to MaterialWithdrawalPDF
Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew Italic.ttf', fontStyle: 'italic' },
    { src: '/fonts/THSarabunNew Bold.ttf', fontWeight: 'bold' },
    { src: '/fonts/THSarabunNew BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' }
  ]
});

// Styles strictly aligned with MaterialWithdrawalPDF (src/lib/pdf-templates.jsx)
const styles = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    padding: '10mm 15mm 30mm 15mm',
    fontSize: 12,
    color: '#000',
    backgroundColor: '#fff',
    position: 'relative'
  },
  // Header
  headerSection: {
    flexDirection: 'row',
    marginBottom: 0,
    alignItems: 'center'
  },
  logoContainer: {
    marginRight: 10,
  },
  logo: {
    height: 80,
    width: 160,
    objectFit: 'contain'
  },
  companyNames: {
    flexDirection: 'column',
    justifyContent: 'center'
  },
  companyTh: {
    fontSize: 28,
    color: '#5b9bd5',
    marginBottom: -3,
  },
  companyEn: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: '#5b9bd5',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: 11,
    color: '#5d9cec',
    marginTop: -10,
    lineHeight: 1.2,
  },
  // Document Title
  docTitleContainer: {
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 15,
    position: 'relative'
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  docCopy: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 10,
  },
  // Meta section
  metaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    fontWeight: 'bold',
    fontSize: 12,
  },
  // Table
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 16,
  },
  th: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2 5',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  thText: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 12,
  },
  td: {
    padding: '2 5',
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 10,
  },
  tdTextCenter: {
    fontSize: 10,
    textAlign: 'center',
  },
  colNo: { width: '8%' },
  colDesc: { width: '50%' },
  colQty: { width: '12%' },
  colSn: { width: '30%', borderRightWidth: 0 },

  // Return Table Specific Columns
  rColNo: { width: '8%' },
  rColDesc: { width: '44%' },
  rColQty: { width: '14%' },
  rColCond: { width: '14%' },
  rColSn: { width: '20%', borderRightWidth: 0 },

  // Signatures Section (Dual Clean Boxes)
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 35,
    paddingTop: 10,
    paddingHorizontal: 15,
  },
  signatureBox: {
    width: '42%',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 8,
  },
  sigName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 2,
  },
  sigRole: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },
  sigDate: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 3,
    textAlign: 'center',
  },
});

/**
 * Material Checkout Voucher (ใบยืมพัสดุ / ใบยืมเครื่องมือ)
 * Strictly standardized to match MaterialWithdrawalPDF layout, typography, and styling
 */
export const MaterialCheckoutPDF = ({ order }) => {
  if (!order) return null;

  const rawItems = order.checkout_items || [];
  
  // Pad items to at least 15 rows to maintain standardized paper voucher structure
  const MIN_ROWS = 15;
  const paddedItems = [...rawItems];
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({});
  }

  const checkoutDateStr = order?.checkout_date
    ? new Date(order.checkout_date).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  const expectedReturnDateStr = order?.expected_return_date
    ? new Date(order.expected_return_date).toLocaleDateString('th-TH')
    : '—';

  const projectDisplay = order?.projects?.project_code 
    ? `${order.projects.project_code} — ${order.projects.name || ''}`
    : (order?.projects?.name || '—');

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Standard Corporate Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Image src="/images/logo.png" style={styles.logo} />
          </View>
          <View style={styles.companyNames}>
            <Text style={styles.companyTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
            <Text style={styles.companyEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
          </View>
        </View>
        <Text style={styles.addressText}>
          1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์ : 02-265-6700 แฟกซ์ : 02-265-6799 เลขประจำตัวผู้เสียภาษี : 0107548000471{"\n"}
          1053/1 Phaholyothin Road, Phayathai Subdistrict, Phayathai District, Bangkok 10400 Tel: +662-265-6700 Fax: +662-265-6799 Tax ID : 0107548000471
        </Text>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบยืมพัสดุ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        {/* Meta Section */}
        <View style={styles.metaSection}>
          <Text>ผู้ยืม : {order?.borrower_name || '—'} {order?.borrower_department ? `(${order.borrower_department})` : ''} — คลัง/โครงการ : {projectDisplay}</Text>
          <Text>เลขที่ : {order?.order_number || '—'}</Text>
        </View>
        <View style={[styles.metaSection, { marginBottom: 10 }]}>
          <Text>วัตถุประสงค์ : {order?.purpose || '—'}</Text>
          <Text>วันที่ยืม : {checkoutDateStr}    กำหนดคืน : {expectedReturnDateStr}</Text>
        </View>

        {/* Standard 4-Column Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.th, styles.colNo]}><Text style={styles.thText}>ลำดับ</Text></View>
            <View style={[styles.th, styles.colDesc]}><Text style={styles.thText}>รายการ</Text></View>
            <View style={[styles.th, styles.colQty]}><Text style={styles.thText}>จำนวน</Text></View>
            <View style={[styles.th, styles.colSn]}><Text style={styles.thText}>Serial Number / หมายเหตุ</Text></View>
          </View>

          {paddedItems.map((item, index) => {
            const isEmpty = !item.item_id && !item.items && !item.quantity_borrowed;
            const itemName = item.items?.name || item.item_name || '';
            const unit = item.items?.unit || 'ชิ้น';
            const serialNotes = [
              item.serial_number,
              item.condition_on_checkout && item.condition_on_checkout !== 'normal' ? `(${item.condition_on_checkout})` : null,
              item.notes
            ].filter(Boolean).join(' ');

            return (
              <View key={index} style={[styles.tableRow, index === paddedItems.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.td, styles.colNo]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : index + 1}</Text>
                </View>
                <View style={[styles.td, styles.colDesc]}>
                  <Text style={styles.tdText}>{isEmpty ? '' : itemName}</Text>
                </View>
                <View style={[styles.td, styles.colQty]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : `${item.quantity_borrowed} ${unit}`}</Text>
                </View>
                <View style={[styles.td, styles.colSn]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : (serialNotes || '—')}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Remark Section */}
        <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
            Remark: <Text style={{ fontWeight: 'normal' }}>{order?.notes || order?.purpose || ''}</Text>
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
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
 * Material Return Receipt (ใบรับคืนพัสดุ / ใบรับคืนเครื่องมือ)
 * Strictly standardized to match MaterialWithdrawalPDF layout, typography, and styling
 */
export const MaterialReturnPDF = ({ order, returnLogs = [] }) => {
  if (!order) return null;

  const rawItems = order.checkout_items || [];
  
  // Pad items to at least 15 rows to maintain standardized paper voucher structure
  const MIN_ROWS = 15;
  const paddedItems = [...rawItems];
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({});
  }

  const checkoutDateStr = order?.checkout_date
    ? new Date(order.checkout_date).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  const actualReturnedDateStr = order?.actual_returned_date
    ? new Date(order.actual_returned_date).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  const projectDisplay = order?.projects?.project_code 
    ? `${order.projects.project_code} — ${order.projects.name || ''}`
    : (order?.projects?.name || '—');

  const returnStatusText = order?.status === 'completed' 
    ? 'คืนครบถ้วน (Completed)' 
    : 'คืนบางส่วน (Partial)';

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Standard Corporate Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Image src="/images/logo.png" style={styles.logo} />
          </View>
          <View style={styles.companyNames}>
            <Text style={styles.companyTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
            <Text style={styles.companyEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
          </View>
        </View>
        <Text style={styles.addressText}>
          1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์ : 02-265-6700 แฟกซ์ : 02-265-6799 เลขประจำตัวผู้เสียภาษี : 0107548000471{"\n"}
          1053/1 Phaholyothin Road, Phayathai Subdistrict, Phayathai District, Bangkok 10400 Tel: +662-265-6700 Fax: +662-265-6799 Tax ID : 0107548000471
        </Text>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบรับคืนพัสดุ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        {/* Meta Section */}
        <View style={styles.metaSection}>
          <Text>ผู้ส่งคืน : {order?.borrower_name || '—'} {order?.borrower_department ? `(${order.borrower_department})` : ''} — คลังจัดเก็บ : {projectDisplay}</Text>
          <Text>อ้างอิงใบยืม : {order?.order_number || '—'}</Text>
        </View>
        <View style={[styles.metaSection, { marginBottom: 10 }]}>
          <Text>สถานะการส่งคืน : {returnStatusText}</Text>
          <Text>วันที่ยืม : {checkoutDateStr}    วันที่รับคืน : {actualReturnedDateStr}</Text>
        </View>

        {/* Return Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.th, styles.rColNo]}><Text style={styles.thText}>ลำดับ</Text></View>
            <View style={[styles.th, styles.rColDesc]}><Text style={styles.thText}>รายการ</Text></View>
            <View style={[styles.th, styles.rColQty]}><Text style={styles.thText}>จำนวนรับคืน</Text></View>
            <View style={[styles.th, styles.rColCond]}><Text style={styles.thText}>สภาพรับคืน</Text></View>
            <View style={[styles.th, styles.rColSn]}><Text style={styles.thText}>Serial Number / หมายเหตุ</Text></View>
          </View>

          {paddedItems.map((item, index) => {
            const isEmpty = !item.item_id && !item.items && !item.quantity_borrowed;
            const itemName = item.items?.name || item.item_name || '';
            const unit = item.items?.unit || 'ชิ้น';
            const conditionText = item.quantity_damaged > 0 
              ? `ชำรุด (${item.quantity_damaged})` 
              : item.quantity_lost > 0 
              ? `สูญหาย (${item.quantity_lost})` 
              : 'ปกติสมบูรณ์';

            const serialNotes = [
              item.serial_number,
              item.notes
            ].filter(Boolean).join(' ');

            return (
              <View key={index} style={[styles.tableRow, index === paddedItems.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.td, styles.rColNo]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : index + 1}</Text>
                </View>
                <View style={[styles.td, styles.rColDesc]}>
                  <Text style={styles.tdText}>{isEmpty ? '' : itemName}</Text>
                </View>
                <View style={[styles.td, styles.rColQty]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : `${item.quantity_returned || 0} / ${item.quantity_borrowed || 0} ${unit}`}</Text>
                </View>
                <View style={[styles.td, styles.rColCond]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : conditionText}</Text>
                </View>
                <View style={[styles.td, styles.rColSn]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : (serialNotes || '—')}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Remark Section */}
        <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
            Remark: <Text style={{ fontWeight: 'normal' }}>{order?.notes || ''}</Text>
          </Text>
        </View>
        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order.borrower_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>ผู้ส่งคืนพัสดุ / ช่างผู้คืน</Text>
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

