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

// Stock Report Component (Professional A4 Multi-Tab Report Generator)
export const StockReportPDF = ({ data = [], type = 'balance' }) => {
  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let reportTitle = 'รายงานสรุปยอดสินค้าคงเหลือ (Stock Balance Report)';
  if (type === 'stock_in') {
    reportTitle = 'รายงานสรุปการรับเข้าวัสดุ (Stock In Report)';
  } else if (type === 'withdrawals') {
    reportTitle = 'รายงานสรุปการเบิกจ่ายวัสดุ (Withdrawal Orders Report)';
  }

  const renderTableHeader = () => {
    if (type === 'stock_in') {
      return (
        <View style={styles.tableHeader} fixed>
          <View style={[styles.th, { width: '6%' }]}><Text style={styles.thText}>ลำดับ</Text></View>
          <View style={[styles.th, { width: '14%' }]}><Text style={styles.thText}>วันที่รับเข้า</Text></View>
          <View style={[styles.th, { width: '24%' }]}><Text style={styles.thText}>โครงการ</Text></View>
          <View style={[styles.th, { width: '26%' }]}><Text style={styles.thText}>รายการวัสดุ</Text></View>
          <View style={[styles.th, { width: '10%' }]}><Text style={styles.thText}>จำนวน</Text></View>
          <View style={[styles.th, { width: '6%' }]}><Text style={styles.thText}>หน่วย</Text></View>
          <View style={[styles.th, { width: '14%', borderRightWidth: 0 }]}><Text style={styles.thText}>Supplier / PO</Text></View>
        </View>
      );
    }
    if (type === 'withdrawals') {
      return (
        <View style={styles.tableHeader} fixed>
          <View style={[styles.th, { width: '6%' }]}><Text style={styles.thText}>ลำดับ</Text></View>
          <View style={[styles.th, { width: '14%' }]}><Text style={styles.thText}>วันที่เบิก</Text></View>
          <View style={[styles.th, { width: '22%' }]}><Text style={styles.thText}>โครงการ</Text></View>
          <View style={[styles.th, { width: '24%' }]}><Text style={styles.thText}>รายการวัสดุ</Text></View>
          <View style={[styles.th, { width: '8%' }]}><Text style={styles.thText}>ขอเบิก</Text></View>
          <View style={[styles.th, { width: '8%' }]}><Text style={styles.thText}>ตัดจริง</Text></View>
          <View style={[styles.th, { width: '6%' }]}><Text style={styles.thText}>หน่วย</Text></View>
          <View style={[styles.th, { width: '12%', borderRightWidth: 0 }]}><Text style={styles.thText}>ผู้เบิก / สถานะ</Text></View>
        </View>
      );
    }
    // Default: Balance
    return (
      <View style={styles.tableHeader} fixed>
        <View style={[styles.th, { width: '6%' }]}><Text style={styles.thText}>ลำดับ</Text></View>
        <View style={[styles.th, { width: '28%' }]}><Text style={styles.thText}>โครงการ</Text></View>
        <View style={[styles.th, { width: '32%' }]}><Text style={styles.thText}>รายการวัสดุ</Text></View>
        <View style={[styles.th, { width: '11%' }]}><Text style={styles.thText}>รับเข้าทั้งหมด</Text></View>
        <View style={[styles.th, { width: '11%' }]}><Text style={styles.thText}>เบิกออกทั้งหมด</Text></View>
        <View style={[styles.th, { width: '12%', borderRightWidth: 0 }]}><Text style={styles.thText}>คงเหลือ</Text></View>
      </View>
    );
  };

  const renderTableRows = () => {
    if (data.length === 0) {
      return (
        <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
          <View style={[styles.td, { width: '100%', borderRightWidth: 0, padding: 10 }]}>
            <Text style={{ textAlign: 'center', color: '#666' }}>ไม่พบข้อมูลรายการในรายงานนี้</Text>
          </View>
        </View>
      );
    }

    return data.map((row, idx) => {
      const isLast = idx === data.length - 1;

      if (type === 'stock_in') {
        const projName = row.projects?.project_code ? `[${row.projects.project_code}] ${row.projects?.name}` : (row.projects?.name || '-');
        const supplierPo = [row.supplier, row.po_number].filter(Boolean).join(' / ') || '-';
        return (
          <View key={idx} style={[styles.tableRow, isLast && { borderBottomWidth: 0 }]} wrap={false}>
            <View style={[styles.td, { width: '6%' }]}><Text style={styles.tdTextCenter}>{idx + 1}</Text></View>
            <View style={[styles.td, { width: '14%' }]}><Text style={styles.tdTextCenter}>{row.received_date || '-'}</Text></View>
            <View style={[styles.td, { width: '24%' }]}><Text style={styles.tdText}>{projName}</Text></View>
            <View style={[styles.td, { width: '26%' }]}><Text style={styles.tdText}>{row.items?.name || '-'}</Text></View>
            <View style={[styles.td, { width: '10%' }]}><Text style={[styles.tdTextCenter, { fontWeight: 'bold', color: '#10b981' }]}>+{row.quantity || 0}</Text></View>
            <View style={[styles.td, { width: '6%' }]}><Text style={styles.tdTextCenter}>{row.items?.unit || '-'}</Text></View>
            <View style={[styles.td, { width: '14%', borderRightWidth: 0 }]}><Text style={styles.tdText}>{supplierPo}</Text></View>
          </View>
        );
      }

      if (type === 'withdrawals') {
        const projName = row.projects?.project_code ? `[${row.projects.project_code}] ${row.projects?.name}` : (row.projects?.name || '-');
        const reqDate = row.requested_at ? new Date(row.requested_at).toLocaleDateString('th-TH') : '-';
        const deducted = row.deducted_quantity !== undefined && row.deducted_quantity !== null ? row.deducted_quantity : (row.status === 'approved' || row.status === 'completed' ? row.quantity : 0);
        const requester = row.profiles?.full_name || '-';

        return (
          <View key={idx} style={[styles.tableRow, isLast && { borderBottomWidth: 0 }]} wrap={false}>
            <View style={[styles.td, { width: '6%' }]}><Text style={styles.tdTextCenter}>{idx + 1}</Text></View>
            <View style={[styles.td, { width: '14%' }]}><Text style={styles.tdTextCenter}>{reqDate}</Text></View>
            <View style={[styles.td, { width: '22%' }]}><Text style={styles.tdText}>{projName}</Text></View>
            <View style={[styles.td, { width: '24%' }]}><Text style={styles.tdText}>{row.items?.name || '-'}</Text></View>
            <View style={[styles.td, { width: '8%' }]}><Text style={styles.tdTextCenter}>{row.quantity || 0}</Text></View>
            <View style={[styles.td, { width: '8%' }]}><Text style={[styles.tdTextCenter, { fontWeight: 'bold', color: '#059669' }]}>{deducted}</Text></View>
            <View style={[styles.td, { width: '6%' }]}><Text style={styles.tdTextCenter}>{row.items?.unit || '-'}</Text></View>
            <View style={[styles.td, { width: '12%', borderRightWidth: 0 }]}><Text style={styles.tdTextCenter}>{requester}</Text></View>
          </View>
        );
      }

      // Default: Balance
      const projName = row.project_name || row.โครงการ || '-';
      const itemName = row.item_name || row.รายการวัสดุ || '-';
      const totalIn = row.total_in !== undefined ? row.total_in : (row.รับเข้าทั้งหมด || 0);
      const totalOut = row.total_out !== undefined ? row.total_out : (row.เบิกออกทั้งหมด || 0);
      const balance = row.balance !== undefined ? row.balance : (row.คงเหลือ || 0);
      const unit = row.unit || row.หน่วย || '';

      return (
        <View key={idx} style={[styles.tableRow, isLast && { borderBottomWidth: 0 }]} wrap={false}>
          <View style={[styles.td, { width: '6%' }]}><Text style={styles.tdTextCenter}>{idx + 1}</Text></View>
          <View style={[styles.td, { width: '28%' }]}><Text style={styles.tdText}>{projName}</Text></View>
          <View style={[styles.td, { width: '32%' }]}><Text style={styles.tdText}>{itemName}</Text></View>
          <View style={[styles.td, { width: '11%' }]}><Text style={[styles.tdTextCenter, { color: '#059669' }]}>+{totalIn}</Text></View>
          <View style={[styles.td, { width: '11%' }]}><Text style={[styles.tdTextCenter, { color: '#d97706' }]}>-{totalOut}</Text></View>
          <View style={[styles.td, { width: '12%', borderRightWidth: 0 }]}><Text style={[styles.tdTextCenter, { fontWeight: 'bold', color: '#1e1b4b' }]}>{balance} {unit}</Text></View>
        </View>
      );
    });
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
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

        {/* Report Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>{reportTitle}</Text>
        </View>

        {/* Meta Section */}
        <View style={styles.metaSection}>
          <Text>จำนวนข้อมูลทั้งหมด: {data.length} รายการ</Text>
          <Text>วันที่พิมพ์: {printDateStr}</Text>
        </View>

        {/* Report Data Table */}
        <View style={styles.table}>
          {renderTableHeader()}
          {renderTableRows()}
        </View>

        {/* Page Numbering Footer */}
        <Text 
          style={{
            position: 'absolute',
            fontSize: 10,
            bottom: 15,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#666666'
          }}
          render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} จาก ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
};

