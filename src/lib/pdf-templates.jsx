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
    fontSize: 16, // ขนาดฟอนต์หัวกระดาษ "ใบนำส่งอุปกรณ์" (24pt)
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

  // Footer / Signatures
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30, // เว้นระยะห่างจากตารางด้านบน
    paddingLeft: 10,
    paddingRight: 10,
  },
  signatureBlock: {
    width: '40%',
  },
  signLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  signLabel: {
    width: 60,
    fontSize: 10, // ขนาดฟอนต์คำกำกับลายเซ็น เช่น "ผู้ส่งของ", "วันที่" (16pt)
  },
  signUnderline: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    marginLeft: 5,
    height: 15,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  signText: {
    fontSize: 10, // ขนาดฟอนต์ชื่อผู้เซ็นที่ลอยอยู่บนเส้นบรรทัด (16pt)
    marginBottom: 1,
  },

  // Report columns
  rCol1: { width: '30%' },
  rCol2: { width: '30%' },
  rCol3: { width: '15%', textAlign: 'right' },
  rCol4: { width: '15%', textAlign: 'right' },
  rCol5: { width: '10%', textAlign: 'right' },
});

export const DeliveryNotePDF = ({ order, items, profile }) => {
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
          <Text style={styles.docTitle}>ใบนำส่งอุปกรณ์</Text>
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

        {/* Remark Section */}
        <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
            Remark: <Text style={{ fontWeight: 'normal' }}>{order?.purpose || ''}</Text>
          </Text>
        </View>

        {/* Footer / Signatures */}
        <View style={styles.footerSection} wrap={false}>
          <View style={styles.signatureBlock}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>ผู้ส่งของ</Text>
              <View style={styles.signUnderline}>
                <Text style={styles.signText}>{profile?.full_name || ''}</Text>
              </View>
            </View>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>เบอร์โทรศัพท์</Text>
              <View style={styles.signUnderline}></View>
            </View>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>วันที่</Text>
              <View style={styles.signUnderline}></View>
            </View>
          </View>

          <View style={styles.signatureBlock}>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>ผู้รับของ</Text>
              <View style={styles.signUnderline}>
                <Text style={styles.signText}>{order?.projects?.name || ''}</Text>
              </View>
            </View>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>เบอร์โทรศัพท์</Text>
              <View style={styles.signUnderline}></View>
            </View>
            <View style={styles.signLine}>
              <Text style={styles.signLabel}>วันที่</Text>
              <View style={styles.signUnderline}></View>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
};

// Stock Report Component
export const StockReportPDF = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={[styles.docTitle, { textAlign: 'center', marginBottom: 20 }]}>รายงานสรุป (Stock Report)</Text>
      <Text style={[styles.addressText, { textAlign: 'right', marginBottom: 10 }]}>
        ข้อมูล ณ วันที่: {new Date().toLocaleDateString('th-TH')}
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.rCol1]}>โครงการ</Text>
          <Text style={[styles.th, styles.rCol2]}>รายการวัสดุ</Text>
          <Text style={[styles.th, styles.rCol3]}>ยอดรับเข้า</Text>
          <Text style={[styles.th, styles.rCol4]}>ยอดเบิกจ่าย</Text>
          <Text style={[styles.th, styles.rCol5, { borderRightWidth: 0 }]}>คงเหลือ</Text>
        </View>

        {data.map((b, index) => (
          <View key={index} style={[styles.tableRow, index === data.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={[styles.td, styles.rCol1]}>{b.project_name || b.โครงการ || ''}</Text>
            <Text style={[styles.td, styles.rCol2]}>{b.item_name || b.รายการวัสดุ || ''}</Text>
            <Text style={[styles.td, styles.rCol3, { color: '#10b981' }]}>+{b.total_in || b.รับเข้าทั้งหมด || 0}</Text>
            <Text style={[styles.td, styles.rCol4, { color: '#f59e0b' }]}>-{b.total_out || b.เบิกออกทั้งหมด || 0}</Text>
            <Text style={[styles.td, styles.rCol5, { fontWeight: 'bold', borderRightWidth: 0 }]}>{b.balance || b.คงเหลือ || 0} {b.unit || b.หน่วย || ''}</Text>
          </View>
        ))}
      </View>
    </Page>
  </Document>
);
