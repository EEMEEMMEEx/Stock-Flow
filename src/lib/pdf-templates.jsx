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

// Styles matching the HTML template
const styles = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    padding: '10mm 15mm 30mm 15mm', // คืนค่า Padding ด้านล่างเป็น 30mm เพราะเราไม่ได้ล็อกลายเซ็นไว้ด้านล่างแล้ว
    fontSize: 12, // ขนาดฟอนต์พื้นฐานของทั้งเอกสาร (16pt)
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
    color: '#5b9bd5', // เปลี่ยนสีให้ฟ้าอ่อนและนวลขึ้นเหมือนต้นฉบับ
    marginBottom: -3, // บีบช่องว่างระหว่างบรรทัดไทยกับอังกฤษ
  },
  companyEn: {
    fontFamily: 'Helvetica', // ตัวอังกฤษในต้นฉบับไม่ใช่ Sarabun แต่เป็นฟอนต์ตระกูล Sans-Serif ที่กลมและกว้าง
    fontSize: 12,
    color: '#5b9bd5',
    letterSpacing: 0.5, // ขยายระยะห่างตัวอักษรเล็กน้อยให้กว้างเท่าภาษาไทย
  },
  addressText: {
    fontSize: 11, // ขนาดฟอนต์ที่อยู่และเลขผู้เสียภาษี (14pt)
    color: '#5d9cec',
    marginTop: -10, // ขยับขึ้นไปชิดกับชื่อบริษัท
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
    fontSize: 16, // ขนาดฟอนต์หัวกระดาษ "ใบเบิกของ" (24pt)
    fontWeight: 'bold',
  },
  docCopy: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 10, // ขนาดฟอนต์คำว่า "ต้นฉบับ" มุมขวาบน (16pt)
  },
  // Meta section
  metaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    fontWeight: 'bold',
    fontSize: 12, // ขนาดฟอนต์บรรทัด "ส่งของที่" และ "Date" (16pt)
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
    minHeight: 16, // ลดความสูงขั้นต่ำของแถวให้แคบลง (เดิม 25)
  },
  th: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2 5', // ลด Padding บนล่าง (เดิม 5)
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  thText: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 12, // ขนาดฟอนต์ข้อความในหัวตาราง (16pt)
  },
  td: {
    padding: '2 5', // ลด Padding บนล่าง (เดิม '4 5')
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 10, // ขนาดฟอนต์ข้อมูลในตารางชิดซ้าย (16pt)
  },
  tdTextCenter: {
    fontSize: 10, // ขนาดฟอนต์ข้อมูลในตารางจัดกึ่งกลาง (16pt)
    textAlign: 'center',
  },
  colNo: { width: '8%' },
  colDesc: { width: '52%' },
  colQty: { width: '10%' },
  colSn: { width: '30%', borderRightWidth: 0 },

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

  // Report columns
  rCol1: { width: '30%' },
  rCol2: { width: '30%' },
  rCol3: { width: '15%', textAlign: 'right' },
  rCol4: { width: '15%', textAlign: 'right' },
  rCol5: { width: '10%', textAlign: 'right' },
});

export const MaterialWithdrawalPDF = ({ order, items, profile }) => {
  // Pad items to at least 15 rows
  const MIN_ROWS = 15;
  const paddedItems = [...items];
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({});
  }

  const dateStr = order?.requested_at
    ? new Date(order.requested_at).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
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
          <Text style={styles.docTitle}>ใบเบิกของ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        <View style={styles.metaSection}>
          <Text>ส่งของที่ : {order?.delivery_address || order?.projects?.name || '—'}</Text>
          <Text>Date. {dateStr}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.th, styles.colNo]}><Text style={styles.thText}>ลำดับ</Text></View>
            <View style={[styles.th, styles.colDesc]}><Text style={styles.thText}>รายการ</Text></View>
            <View style={[styles.th, styles.colQty]}><Text style={styles.thText}>จำนวน</Text></View>
            <View style={[styles.th, styles.colSn]}><Text style={styles.thText}>Serial Number/Part Number</Text></View>
          </View>

          {paddedItems.map((item, index) => {
            const isEmpty = !item.items;
            const serialPart = [item.serial_number, item.part_number].filter(Boolean).join(' / ');

            return (
              <View key={index} style={[styles.tableRow, index === paddedItems.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.td, styles.colNo]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : index + 1}</Text>
                </View>
                <View style={[styles.td, styles.colDesc]}>
                  <Text style={styles.tdText}>{isEmpty ? '' : item.items?.name}</Text>
                </View>
                <View style={[styles.td, styles.colQty]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : `${item.quantity} ${item.items?.unit || ''}`}</Text>
                </View>
                <View style={[styles.td, styles.colSn]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : serialPart}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Remark Section (Only if not empty) */}
        {(order?.notes?.trim() || order?.purpose?.trim()) && (
          <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
              Remark: <Text style={{ fontWeight: 'normal' }}>{order?.notes?.trim() || order?.purpose?.trim()}</Text>
            </Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order?.borrower_name || order?.requester_name || order?.projects?.name || '...................................................'})</Text>
            <Text style={styles.sigRole}>ผู้ขอยืมพัสดุ / ช่างผู้เบิก</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            <Text style={styles.sigName}>({order?.profiles?.full_name || profile?.full_name || '...................................................'})</Text>
            <Text style={styles.sigRole}>เจ้าหน้าที่ผู้จ่ายพัสดุ / เจ้าหน้าที่คลัง</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
};

// ---------------------------------------------------------------------------
// Modern Professional Stock Report Styles
// ---------------------------------------------------------------------------
const reportStyles = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    padding: '8mm 12mm 16mm 12mm',
    fontSize: 11,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    position: 'relative'
  },
  // Corporate Header
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0284c7', // Forth Blue
    marginBottom: 6
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  logo: {
    height: 38,
    width: 90,
    objectFit: 'contain',
    marginRight: 8
  },
  companyDetails: {
    flexDirection: 'column'
  },
  companyNameTh: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.1
  },
  companyNameEn: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#0284c7',
    letterSpacing: 0.5,
    marginTop: 1
  },
  companyAddress: {
    fontSize: 7.5,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 1.15
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  docBadge: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3
  },
  docBadgeText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0369a1'
  },
  printDateText: {
    fontSize: 8,
    color: '#64748b'
  },

  // Title Banner
  titleBanner: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: '4 8',
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  titleText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  filterInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  filterChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 4
  },
  filterChipText: {
    fontSize: 8,
    color: '#334155'
  },

  // Summary KPI Cards
  kpiContainer: {
    flexDirection: 'row',
    marginBottom: 8
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    padding: '3 5',
    alignItems: 'center',
    marginRight: 4
  },
  kpiCardLast: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    padding: '3 5',
    alignItems: 'center',
    marginRight: 0
  },
  kpiLabel: {
    fontSize: 7.5,
    color: '#64748b',
    fontWeight: 'bold',
    marginBottom: 1
  },
  kpiValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.1
  },

  // Table
  tableContainer: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    overflow: 'hidden'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#87daf5', // Forth Sky Cyan
    borderBottomWidth: 1,
    borderBottomColor: '#5bbfe0',
    minHeight: 22,
    alignItems: 'center'
  },
  th: {
    paddingTop: 4,
    paddingBottom: 3,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#67c6e6'
  },
  thText: {
    fontWeight: 'bold',
    fontSize: 9.5,
    color: '#0f172a', // High-contrast dark slate text on light blue
    textAlign: 'center',
    lineHeight: 1.1
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#e2e8f0',
    minHeight: 19,
    alignItems: 'center'
  },
  tableRowEven: {
    backgroundColor: '#f8fafc'
  },
  tableRowOdd: {
    backgroundColor: '#ffffff'
  },
  td: {
    paddingTop: 3.5,
    paddingBottom: 2.5,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 0.75,
    borderRightColor: '#e2e8f0'
  },
  tdText: {
    fontSize: 8.5,
    color: '#1e293b',
    lineHeight: 1.15
  },
  tdTextBold: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.15
  },
  tdTextCenter: {
    fontSize: 8.5,
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 1.15
  },
  tdTextRight: {
    fontSize: 8.5,
    color: '#1e293b',
    textAlign: 'right',
    lineHeight: 1.15
  },

  // Stock Highlight Colors
  stockInText: {
    color: '#059669', // Emerald
    fontWeight: 'bold',
    fontSize: 8.5
  },
  stockOutText: {
    color: '#dc2626', // Red
    fontWeight: 'bold',
    fontSize: 8.5
  },
  balanceText: {
    color: '#1e40af', // Blue
    fontWeight: 'bold',
    fontSize: 9
  },
  balanceZeroText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 8
  },

  // Table Summary Footer
  tableFooterRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1.5,
    borderTopColor: '#cbd5e1',
    minHeight: 20,
    alignItems: 'center'
  },
  tfText: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#0f172a',
    lineHeight: 1.1
  },

  // Page Footer
  pageFooter: {
    position: 'absolute',
    bottom: 6,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 3
  },
  footerText: {
    fontSize: 7.5,
    color: '#94a3b8'
  }
});

// Professional Stock Report Component (A4 Landscape-friendly or Portrait Executive Layout)
export const StockReportPDF = ({ 
  data = [], 
  type = 'balance',
  projectName = '',
  categoryName = '',
  startDate = '',
  endDate = '',
  searchQuery = ''
}) => {
  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let reportTitle = 'รายงานสรุปยอดสินค้าคงเหลือ (Stock Balance Report)';
  let reportCategoryLabel = 'สต็อกคงเหลือ';
  if (type === 'stock_in') {
    reportTitle = 'รายงานสรุปการรับเข้าวัสดุ (Stock In Report)';
    reportCategoryLabel = 'รับเข้าพัสดุ';
  } else if (type === 'withdrawals') {
    reportTitle = 'รายงานสรุปการเบิกจ่ายวัสดุ (Withdrawal Orders Report)';
    reportCategoryLabel = 'เบิกจ่ายพัสดุ';
  }

  // Calculate Metrics
  const totalItems = data.length;
  let totalInQty = 0;
  let totalOutQty = 0;
  let totalBalanceQty = 0;
  let zeroStockCount = 0;

  if (type === 'balance') {
    data.forEach((r) => {
      const inVal = Number(r.total_in !== undefined ? r.total_in : (r.รับเข้าทั้งหมด || 0)) || 0;
      const outVal = Number(r.total_out !== undefined ? r.total_out : (r.เบิกออกทั้งหมด || 0)) || 0;
      const balVal = Number(r.balance !== undefined ? r.balance : (r.คงเหลือ || 0)) || 0;
      totalInQty += inVal;
      totalOutQty += outVal;
      totalBalanceQty += balVal;
      if (balVal <= 0) zeroStockCount++;
    });
  } else if (type === 'stock_in') {
    data.forEach((r) => {
      totalInQty += Number(r.quantity || 0);
    });
  } else if (type === 'withdrawals') {
    data.forEach((r) => {
      const deducted = r.deducted_quantity !== undefined && r.deducted_quantity !== null 
        ? Number(r.deducted_quantity) 
        : (r.status === 'approved' || r.status === 'completed' ? Number(r.quantity || 0) : 0);
      totalOutQty += (deducted || 0);
      totalInQty += Number(r.quantity || 0); // Requested
    });
  }

  const renderTableHeader = () => {
    if (type === 'stock_in') {
      return (
        <View style={reportStyles.tableHeader} fixed>
          <View style={[reportStyles.th, { width: '5%' }]}><Text style={reportStyles.thText}>ลำดับ</Text></View>
          <View style={[reportStyles.th, { width: '13%' }]}><Text style={reportStyles.thText}>วันที่รับเข้า</Text></View>
          <View style={[reportStyles.th, { width: '22%' }]}><Text style={reportStyles.thText}>โครงการ</Text></View>
          <View style={[reportStyles.th, { width: '27%' }]}><Text style={reportStyles.thText}>รายการวัสดุ</Text></View>
          <View style={[reportStyles.th, { width: '11%' }]}><Text style={reportStyles.thText}>จำนวน</Text></View>
          <View style={[reportStyles.th, { width: '7%' }]}><Text style={reportStyles.thText}>หน่วย</Text></View>
          <View style={[reportStyles.th, { width: '15%', borderRightWidth: 0 }]}><Text style={reportStyles.thText}>Supplier / PO</Text></View>
        </View>
      );
    }
    if (type === 'withdrawals') {
      return (
        <View style={reportStyles.tableHeader} fixed>
          <View style={[reportStyles.th, { width: '5%' }]}><Text style={reportStyles.thText}>ลำดับ</Text></View>
          <View style={[reportStyles.th, { width: '13%' }]}><Text style={reportStyles.thText}>วันที่เบิก</Text></View>
          <View style={[reportStyles.th, { width: '21%' }]}><Text style={reportStyles.thText}>โครงการ</Text></View>
          <View style={[reportStyles.th, { width: '25%' }]}><Text style={reportStyles.thText}>รายการวัสดุ</Text></View>
          <View style={[reportStyles.th, { width: '8%' }]}><Text style={reportStyles.thText}>ขอเบิก</Text></View>
          <View style={[reportStyles.th, { width: '8%' }]}><Text style={reportStyles.thText}>ตัดจริง</Text></View>
          <View style={[reportStyles.th, { width: '6%' }]}><Text style={reportStyles.thText}>หน่วย</Text></View>
          <View style={[reportStyles.th, { width: '14%', borderRightWidth: 0 }]}><Text style={reportStyles.thText}>ผู้เบิก / สถานะ</Text></View>
        </View>
      );
    }
    // Default: Balance
    return (
      <View style={reportStyles.tableHeader} fixed>
        <View style={[reportStyles.th, { width: '5%' }]}><Text style={reportStyles.thText}>ลำดับ</Text></View>
        <View style={[reportStyles.th, { width: '25%' }]}><Text style={reportStyles.thText}>โครงการ</Text></View>
        <View style={[reportStyles.th, { width: '34%' }]}><Text style={reportStyles.thText}>รายการวัสดุ</Text></View>
        <View style={[reportStyles.th, { width: '12%' }]}><Text style={reportStyles.thText}>รับเข้าทั้งหมด</Text></View>
        <View style={[reportStyles.th, { width: '12%' }]}><Text style={reportStyles.thText}>เบิกออกทั้งหมด</Text></View>
        <View style={[reportStyles.th, { width: '12%', borderRightWidth: 0 }]}><Text style={reportStyles.thText}>คงเหลือ</Text></View>
      </View>
    );
  };

  const renderTableRows = () => {
    if (data.length === 0) {
      return (
        <View style={[reportStyles.tableRow, { borderBottomWidth: 0 }]}>
          <View style={[reportStyles.td, { width: '100%', borderRightWidth: 0, padding: 12 }]}>
            <Text style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10 }}>ไม่พบข้อมูลรายการในรายงานนี้</Text>
          </View>
        </View>
      );
    }

    return data.map((row, idx) => {
      const isEven = idx % 2 === 1;
      const rowStyle = [reportStyles.tableRow, isEven ? reportStyles.tableRowEven : reportStyles.tableRowOdd];

      if (type === 'stock_in') {
        const projName = row.projects?.project_code ? `[${row.projects.project_code}] ${row.projects?.name}` : (row.projects?.name || '-');
        const supplierPo = [row.supplier, row.po_number].filter(Boolean).join(' / ') || '-';
        return (
          <View key={idx} style={rowStyle} wrap={false}>
            <View style={[reportStyles.td, { width: '5%' }]}><Text style={reportStyles.tdTextCenter}>{idx + 1}</Text></View>
            <View style={[reportStyles.td, { width: '13%' }]}><Text style={reportStyles.tdTextCenter}>{row.received_date || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '22%' }]}><Text style={reportStyles.tdText}>{projName}</Text></View>
            <View style={[reportStyles.td, { width: '27%' }]}><Text style={reportStyles.tdTextBold}>{row.items?.name || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '11%' }]}><Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>+{row.quantity || 0}</Text></View>
            <View style={[reportStyles.td, { width: '7%' }]}><Text style={reportStyles.tdTextCenter}>{row.items?.unit || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '15%', borderRightWidth: 0 }]}><Text style={reportStyles.tdText}>{supplierPo}</Text></View>
          </View>
        );
      }

      if (type === 'withdrawals') {
        const projName = row.projects?.project_code ? `[${row.projects.project_code}] ${row.projects?.name}` : (row.projects?.name || '-');
        const reqDate = row.requested_at ? new Date(row.requested_at).toLocaleDateString('th-TH') : '-';
        const deducted = row.deducted_quantity !== undefined && row.deducted_quantity !== null ? row.deducted_quantity : (row.status === 'approved' || row.status === 'completed' ? row.quantity : 0);
        const requester = row.profiles?.full_name || '-';

        return (
          <View key={idx} style={rowStyle} wrap={false}>
            <View style={[reportStyles.td, { width: '5%' }]}><Text style={reportStyles.tdTextCenter}>{idx + 1}</Text></View>
            <View style={[reportStyles.td, { width: '13%' }]}><Text style={reportStyles.tdTextCenter}>{reqDate}</Text></View>
            <View style={[reportStyles.td, { width: '21%' }]}><Text style={reportStyles.tdText}>{projName}</Text></View>
            <View style={[reportStyles.td, { width: '25%' }]}><Text style={reportStyles.tdTextBold}>{row.items?.name || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '8%' }]}><Text style={reportStyles.tdTextCenter}>{row.quantity || 0}</Text></View>
            <View style={[reportStyles.td, { width: '8%' }]}><Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>{deducted}</Text></View>
            <View style={[reportStyles.td, { width: '6%' }]}><Text style={reportStyles.tdTextCenter}>{row.items?.unit || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '14%', borderRightWidth: 0 }]}><Text style={reportStyles.tdTextCenter}>{requester}</Text></View>
          </View>
        );
      }

      // Default: Balance
      const projName = row.project_name || row.โครงการ || '-';
      const itemName = row.item_name || row.รายการวัสดุ || '-';
      const totalIn = row.total_in !== undefined ? row.total_in : (row.รับเข้าทั้งหมด || 0);
      const totalOut = row.total_out !== undefined ? row.total_out : (row.เบิกออกทั้งหมด || 0);
      const balance = row.balance !== undefined ? row.balance : (row.คงเหลือ || 0);
      const unit = row.unit || row.หน่วย || 'ชิ้น';
      const isZero = Number(balance) <= 0;

      return (
        <View key={idx} style={rowStyle} wrap={false}>
          <View style={[reportStyles.td, { width: '5%' }]}><Text style={reportStyles.tdTextCenter}>{idx + 1}</Text></View>
          <View style={[reportStyles.td, { width: '25%' }]}><Text style={reportStyles.tdText}>{projName}</Text></View>
          <View style={[reportStyles.td, { width: '34%' }]}><Text style={reportStyles.tdTextBold}>{itemName}</Text></View>
          <View style={[reportStyles.td, { width: '12%' }]}><Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>+{totalIn}</Text></View>
          <View style={[reportStyles.td, { width: '12%' }]}><Text style={[reportStyles.tdTextCenter, reportStyles.stockOutText]}>-{totalOut}</Text></View>
          <View style={[reportStyles.td, { width: '12%', borderRightWidth: 0 }]}>
            <Text style={[reportStyles.tdTextCenter, isZero ? reportStyles.balanceZeroText : reportStyles.balanceText]}>
              {balance} {unit}
            </Text>
          </View>
        </View>
      );
    });
  };

  const renderTableFooter = () => {
    if (data.length === 0) return null;

    if (type === 'balance') {
      return (
        <View style={reportStyles.tableFooterRow} wrap={false}>
          <View style={[reportStyles.td, { width: '64%', justifyContent: 'center' }]}>
            <Text style={[reportStyles.tfText, { textAlign: 'right', paddingRight: 6 }]}>รวมยอดทั้งหมด (Total Summary):</Text>
          </View>
          <View style={[reportStyles.td, { width: '12%' }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>+{totalInQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '12%' }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.stockOutText]}>-{totalOutQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '12%', borderRightWidth: 0 }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.balanceText]}>{totalBalanceQty} ชิ้น</Text>
          </View>
        </View>
      );
    }

    if (type === 'stock_in') {
      return (
        <View style={reportStyles.tableFooterRow} wrap={false}>
          <View style={[reportStyles.td, { width: '67%', justifyContent: 'center' }]}>
            <Text style={[reportStyles.tfText, { textAlign: 'right', paddingRight: 6 }]}>รวมยอดรับเข้าทั้งสิ้น:</Text>
          </View>
          <View style={[reportStyles.td, { width: '11%' }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>+{totalInQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '22%', borderRightWidth: 0 }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.tdTextBold]}>{totalItems} รายการ</Text>
          </View>
        </View>
      );
    }

    if (type === 'withdrawals') {
      return (
        <View style={reportStyles.tableFooterRow} wrap={false}>
          <View style={[reportStyles.td, { width: '64%', justifyContent: 'center' }]}>
            <Text style={[reportStyles.tfText, { textAlign: 'right', paddingRight: 6 }]}>รวมยอดเบิกจ่ายทั้งสิ้น:</Text>
          </View>
          <View style={[reportStyles.td, { width: '8%' }]}>
            <Text style={reportStyles.tdTextCenter}>{totalInQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '8%' }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>{totalOutQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '20%', borderRightWidth: 0 }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.tdTextBold]}>{totalItems} รายการ</Text>
          </View>
        </View>
      );
    }
    return null;
  };

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        {/* Executive Corporate Header */}
        <View style={reportStyles.headerContainer}>
          <View style={reportStyles.headerLeft}>
            <Image src="/images/logo.png" style={reportStyles.logo} />
            <View style={reportStyles.companyDetails}>
              <Text style={reportStyles.companyNameTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
              <Text style={reportStyles.companyNameEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
              <Text style={reportStyles.companyAddress}>
                1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์ : 02-265-6700
              </Text>
            </View>
          </View>

          <View style={reportStyles.headerRight}>
            <View style={reportStyles.docBadge}>
              <Text style={reportStyles.docBadgeText}>OFFICIAL REPORT</Text>
            </View>
            <Text style={reportStyles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Title Banner & Context Chips */}
        <View style={reportStyles.titleBanner}>
          <Text style={reportStyles.titleText}>{reportTitle}</Text>
          <View style={reportStyles.filterInfoContainer}>
            {projectName ? (
              <View style={reportStyles.filterChip}>
                <Text style={reportStyles.filterChipText}>โครงการ: {projectName}</Text>
              </View>
            ) : null}
            {categoryName && categoryName !== 'ทุกหมวดหมู่' ? (
              <View style={reportStyles.filterChip}>
                <Text style={reportStyles.filterChipText}>หมวดหมู่: {categoryName}</Text>
              </View>
            ) : null}
            {startDate || endDate ? (
              <View style={reportStyles.filterChip}>
                <Text style={reportStyles.filterChipText}>
                  ช่วงเวลา: {startDate || '-'} ถึง {endDate || '-'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Summary Metric KPI Cards */}
        <View style={reportStyles.kpiContainer}>
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>จำนวนรายการ (ITEMS)</Text>
            <Text style={reportStyles.kpiValue}>{totalItems} รายการ</Text>
          </View>
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>ยอดรับเข้าสะสม (TOTAL IN)</Text>
            <Text style={[reportStyles.kpiValue, { color: '#059669' }]}>+{totalInQty.toLocaleString()}</Text>
          </View>
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>ยอดเบิกออกสะสม (TOTAL OUT)</Text>
            <Text style={[reportStyles.kpiValue, { color: '#dc2626' }]}>-{totalOutQty.toLocaleString()}</Text>
          </View>
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>ยอดคงเหลือสุทธิ (NET BALANCE)</Text>
            <Text style={[reportStyles.kpiValue, { color: '#1e40af' }]}>{totalBalanceQty.toLocaleString()}</Text>
          </View>
          <View style={reportStyles.kpiCardLast}>
            <Text style={reportStyles.kpiLabel}>สต็อกหมด / วิกฤต (OUT OF STOCK)</Text>
            <Text style={[reportStyles.kpiValue, { color: zeroStockCount > 0 ? '#ea580c' : '#059669' }]}>
              {zeroStockCount} รายการ
            </Text>
          </View>
        </View>

        {/* Report Data Table */}
        <View style={reportStyles.tableContainer}>
          {renderTableHeader()}
          {renderTableRows()}
          {renderTableFooter()}
        </View>

        {/* Executive Page Footer */}
        <View style={reportStyles.pageFooter} fixed>
          <Text style={reportStyles.footerText}>
            Stock-Flow Inventory & Material Flow OS — Forth Corporation Public Company Limited
          </Text>
          <Text 
            style={[reportStyles.footerText, { fontWeight: 'bold' }]}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} จาก ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

// Professional Site Kits BOM Readiness Report Component (A4 Landscape)
export const SiteKitsReportPDF = ({
  items = [],
  siteKits = [],
  projectName = 'ทุกสถานที่จัดเก็บ (รวมทุกคลัง)',
  categoryName = 'ทั้งหมด 4 หมวด',
  searchTerm = ''
}) => {
  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalBomItems = items.length;
  let totalStockUnits = 0;
  let limitingCount = 0;
  let outOfStockCount = 0;
  let readyCount = 0;

  items.forEach(item => {
    const stock = Number(item.total_stock || 0);
    totalStockUnits += stock;
    if (stock === 0) {
      outOfStockCount++;
    } else if (item.isLimiting) {
      limitingCount++;
    } else {
      readyCount++;
    }
  });

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={reportStyles.page}>
        {/* Executive Corporate Header */}
        <View style={reportStyles.headerContainer}>
          <View style={reportStyles.headerLeft}>
            <Image src="/images/logo.png" style={reportStyles.logo} />
            <View style={reportStyles.companyDetails}>
              <Text style={reportStyles.companyNameTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
              <Text style={reportStyles.companyNameEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
              <Text style={reportStyles.companyAddress}>
                1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์ : 02-265-6700
              </Text>
            </View>
          </View>

          <View style={reportStyles.headerRight}>
            <View style={[reportStyles.docBadge, { borderColor: '#059669', backgroundColor: '#ecfdf5' }]}>
              <Text style={[reportStyles.docBadgeText, { color: '#059669' }]}>SITE KITS BOM REPORT</Text>
            </View>
            <Text style={reportStyles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Title Banner & Context Chips */}
        <View style={reportStyles.titleBanner}>
          <Text style={reportStyles.titleText}>รายงานความพร้อมชุดติดตั้งไซต์ตาม BOM (Site Kits Readiness Report)</Text>
          <View style={reportStyles.filterInfoContainer}>
            <View style={reportStyles.filterChip}>
              <Text style={reportStyles.filterChipText}>สถานที่จัดเก็บ: {projectName}</Text>
            </View>
            <View style={reportStyles.filterChip}>
              <Text style={reportStyles.filterChipText}>หมวดหมู่: {categoryName}</Text>
            </View>
            {searchTerm ? (
              <View style={reportStyles.filterChip}>
                <Text style={reportStyles.filterChipText}>ค้นหา: "{searchTerm}"</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Category Complete Sets & Summary Metric KPI Cards */}
        <View style={reportStyles.kpiContainer}>
          {siteKits.map((cat, cIdx) => (
            <View key={cIdx} style={reportStyles.kpiCard}>
              <Text style={reportStyles.kpiLabel}>ชุดพร้อมจัด ({cat.category_name?.split(' ')[0] || `หมวด ${cIdx+1}`})</Text>
              <Text style={[reportStyles.kpiValue, { color: cat.complete_sets > 0 ? '#059669' : '#dc2626' }]}>
                {cat.complete_sets} ชุด
              </Text>
            </View>
          ))}
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>รายการตาม BOM</Text>
            <Text style={reportStyles.kpiValue}>{totalBomItems} รายการ</Text>
          </View>
          <View style={reportStyles.kpiCard}>
            <Text style={reportStyles.kpiLabel}>สต็อกจำกัด (LIMITING)</Text>
            <Text style={[reportStyles.kpiValue, { color: '#d97706' }]}>{limitingCount} รายการ</Text>
          </View>
          <View style={reportStyles.kpiCardLast}>
            <Text style={reportStyles.kpiLabel}>หมดสต็อก (OUT OF STOCK)</Text>
            <Text style={[reportStyles.kpiValue, { color: outOfStockCount > 0 ? '#dc2626' : '#059669' }]}>
              {outOfStockCount} รายการ
            </Text>
          </View>
        </View>

        {/* Report Data Table */}
        <View style={reportStyles.tableContainer}>
          <View style={reportStyles.tableHeader} fixed>
            <View style={[reportStyles.th, { width: '4%' }]}><Text style={reportStyles.thText}>ลำดับ</Text></View>
            <View style={[reportStyles.th, { width: '17%' }]}><Text style={reportStyles.thText}>หมวดหมู่อุปกรณ์</Text></View>
            <View style={[reportStyles.th, { width: '17%' }]}><Text style={reportStyles.thText}>Part Number</Text></View>
            <View style={[reportStyles.th, { width: '28%' }]}><Text style={reportStyles.thText}>รายการอุปกรณ์ตาม BOM</Text></View>
            <View style={[reportStyles.th, { width: '7%' }]}><Text style={reportStyles.thText}>สเปก/ไซต์</Text></View>
            <View style={[reportStyles.th, { width: '8%' }]}><Text style={reportStyles.thText}>สต็อกจริง</Text></View>
            <View style={[reportStyles.th, { width: '7%' }]}><Text style={reportStyles.thText}>จัดได้</Text></View>
            <View style={[reportStyles.th, { width: '5%' }]}><Text style={reportStyles.thText}>ขาด</Text></View>
            <View style={[reportStyles.th, { width: '7%', borderRightWidth: 0 }]}><Text style={reportStyles.thText}>สถานะ</Text></View>
          </View>

          {items.length === 0 ? (
            <View style={[reportStyles.tableRow, { borderBottomWidth: 0 }]}>
              <View style={[reportStyles.td, { width: '100%', borderRightWidth: 0, padding: 12 }]}>
                <Text style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10 }}>ไม่พบข้อมูลรายการวัสดุในรายงานนี้</Text>
              </View>
            </View>
          ) : (
            items.map((item, idx) => {
              const isEven = idx % 2 === 1;
              const rowStyle = [reportStyles.tableRow, isEven ? reportStyles.tableRowEven : reportStyles.tableRowOdd];
              const isOutOfStock = (item.total_stock || 0) === 0;
              const isLimiting = item.isLimiting;
              
              let statusText = 'พร้อมจัดชุด';
              let statusColor = '#059669';
              if (isOutOfStock) {
                statusText = 'หมดสต็อก';
                statusColor = '#dc2626';
              } else if (isLimiting) {
                statusText = 'สต็อกจำกัด';
                statusColor = '#d97706';
              }

              return (
                <View key={idx} style={rowStyle} wrap={false}>
                  <View style={[reportStyles.td, { width: '4%' }]}><Text style={reportStyles.tdTextCenter}>{idx + 1}</Text></View>
                  <View style={[reportStyles.td, { width: '17%' }]}><Text style={reportStyles.tdText}>{item.category_name || '-'}</Text></View>
                  <View style={[reportStyles.td, { width: '17%' }]}><Text style={reportStyles.tdTextBold}>{item.part_number || '-'}</Text></View>
                  <View style={[reportStyles.td, { width: '28%' }]}><Text style={reportStyles.tdText}>{item.bom_name || '-'}</Text></View>
                  <View style={[reportStyles.td, { width: '7%' }]}><Text style={reportStyles.tdTextCenter}>{item.qty_per_site} {item.unit || 'ชิ้น'}</Text></View>
                  <View style={[reportStyles.td, { width: '8%' }]}>
                    <Text style={[reportStyles.tdTextCenter, isOutOfStock ? { color: '#dc2626', fontWeight: 'bold' } : { color: '#0f172a', fontWeight: 'bold' }]}>
                      {item.total_stock} {item.unit || 'ชิ้น'}
                    </Text>
                  </View>
                  <View style={[reportStyles.td, { width: '7%' }]}>
                    <Text style={[reportStyles.tdTextCenter, isLimiting ? { color: '#d97706', fontWeight: 'bold' } : { color: '#059669', fontWeight: 'bold' }]}>
                      {item.sets_possible} ชุด
                    </Text>
                  </View>
                  <View style={[reportStyles.td, { width: '5%' }]}>
                    <Text style={[reportStyles.tdTextCenter, item.missing_for_next_set > 0 ? { color: '#dc2626', fontWeight: 'bold' } : { color: '#94a3b8' }]}>
                      {item.missing_for_next_set > 0 ? `-${item.missing_for_next_set}` : '0'}
                    </Text>
                  </View>
                  <View style={[reportStyles.td, { width: '7%', borderRightWidth: 0 }]}>
                    <Text style={[reportStyles.tdTextCenter, { color: statusColor, fontWeight: 'bold', fontSize: 8 }]}>
                      {statusText}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Table Summary Footer */}
          {items.length > 0 && (
            <View style={reportStyles.tableFooterRow} wrap={false}>
              <View style={[reportStyles.td, { width: '73%', justifyContent: 'center' }]}>
                <Text style={[reportStyles.tfText, { textAlign: 'right', paddingRight: 6 }]}>รวมยอดทั้งหมด (Total BOM Items):</Text>
              </View>
              <View style={[reportStyles.td, { width: '8%' }]}>
                <Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>{totalStockUnits} ชิ้น</Text>
              </View>
              <View style={[reportStyles.td, { width: '19%', borderRightWidth: 0 }]}>
                <Text style={[reportStyles.tdTextCenter, reportStyles.tdTextBold]}>รวม {totalBomItems} รายการ</Text>
              </View>
            </View>
          )}
        </View>

        {/* Executive Page Footer */}
        <View style={reportStyles.pageFooter} fixed>
          <Text style={reportStyles.footerText}>
            Stock-Flow Inventory & Material Flow OS — Forth Corporation Public Company Limited
          </Text>
          <Text 
            style={[reportStyles.footerText, { fontWeight: 'bold' }]}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} จาก ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};


