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
  // Executive Corporate Header
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
    paddingTop: 8,
  },
  sigName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 2,
  },
  sigRole: {
    fontSize: 10,
    color: '#000000',
    marginTop: 2,
    textAlign: 'center',
  },
  sigDate: {
    fontSize: 10,
    color: '#000000',
    marginTop: 3,
    textAlign: 'center',
  },
  sigImage: {
    height: 32,
    width: 90,
    objectFit: 'contain',
    marginBottom: 4,
  },
  sigSpacer: {
    height: 32,
    marginBottom: 4,
  },
});

/**
 * Material Checkout Voucher (ใบยืมพัสดุ / ใบยืมเครื่องมือ)
 * Strictly standardized to match MaterialWithdrawalPDF layout, typography, and styling
 */
export const MaterialCheckoutPDF = ({ order, staffProfile }) => {
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

  const isIndefinite = order?.borrow_type === 'indefinite' || !order?.expected_return_date;
  const expectedReturnDateStr = isIndefinite
    ? 'ไม่มีกำหนดคืน (Indefinite)'
    : (order?.expected_return_date ? new Date(order.expected_return_date).toLocaleDateString('th-TH') : '—');

  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Suppress Remark if notes are empty or exact duplicate of purpose
  const effectiveRemark = order?.notes?.trim() && order?.notes?.trim() !== order?.purpose?.trim()
    ? order.notes.trim()
    : null;

  // Resolve borrower name dynamically from order data
  const borrowerDisplayName = order?.borrower_name
    || (Array.isArray(order?.borrower) ? order.borrower[0]?.full_name : order?.borrower?.full_name)
    || order?.borrower_profile?.full_name
    || '...................................................';

  // Resolve warehouse officer (staff) who created/processed the checkout transaction at the terminal
  // Resiliently handles:
  // 1) order.profiles as an object { full_name }
  // 2) order.profiles as an array [{ full_name }] (Supabase PostgREST 1-to-many embedding)
  // 3) order.creator / order.created_by_profile / order.staff
  // 4) explicit staffProfile prop passed from checkout detail modal / workflow
  const creatorProfile = Array.isArray(order?.profiles)
    ? order.profiles[0]
    : (order?.profiles || order?.creator || order?.created_by_profile || order?.staff || staffProfile);

  const staffDisplayName = creatorProfile?.full_name
    || creatorProfile?.name
    || order?.created_by_name
    || order?.staff_name
    || (typeof staffProfile === 'string' ? staffProfile : staffProfile?.full_name)
    || '...................................................';

  // Resolve digital signature images
  const borrowerSignatureUrl = order?.borrower_signature_url
    || order?.signature_url
    || (Array.isArray(order?.borrower) ? order.borrower[0]?.signature_url : order?.borrower?.signature_url)
    || order?.borrower_profile?.signature_url
    || null;

  const staffSignatureUrl = creatorProfile?.signature_url
    || staffProfile?.signature_url
    || order?.staff_signature_url
    || null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Executive Corporate Header */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Image src="/images/logo.png" style={styles.logo} />
            <View style={styles.companyDetails}>
              <Text style={styles.companyNameTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
              <Text style={styles.companyNameEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
              <Text style={styles.companyAddress}>
                1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์: 02-265-6700
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.docBadge}>
              <Text style={styles.docBadgeText}>Material Checkout Report</Text>
            </View>
            <Text style={styles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบยืมพัสดุ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        {/* Meta Section */}
        <View style={styles.metaSection}>
          <Text>ผู้ยืม : {order?.borrower_name || '—'}</Text>
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

        {/* Remark Section (Suppressed if redundant/empty) */}
        {effectiveRemark && (
          <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
              Remark: <Text style={{ fontWeight: 'normal' }}>{effectiveRemark}</Text>
            </Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            {borrowerSignatureUrl ? (
              <Image src={borrowerSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({borrowerDisplayName})</Text>
            <Text style={styles.sigRole}>ผู้ขอยืมพัสดุ</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            {staffSignatureUrl ? (
              <Image src={staffSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({staffDisplayName})</Text>
            <Text style={styles.sigRole}>เจ้าหน้าที่ผู้จ่ายพัสดุ</Text>
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
export const MaterialReturnPDF = ({ order, returnLogs = [], staffProfile }) => {
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

  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Suppress Remark if notes are empty or exact duplicate of purpose
  const effectiveRemark = order?.notes?.trim() && order?.notes?.trim() !== order?.purpose?.trim()
    ? order.notes.trim()
    : null;

  const returnStatusText = order?.status === 'completed' 
    ? 'คืนครบถ้วน (Completed)' 
    : 'คืนบางส่วน (Partial)';

  // Resolve borrower/returner name
  const borrowerDisplayName = order?.borrower_name
    || (Array.isArray(order?.borrower) ? order.borrower[0]?.full_name : order?.borrower?.full_name)
    || order?.borrower_profile?.full_name
    || '...................................................';

  // Resolve return receiver officer from returnLogs or creator/staffProfile
  const firstReturnLog = returnLogs?.[0];
  const returnReceiverProfile = Array.isArray(firstReturnLog?.profiles)
    ? firstReturnLog.profiles[0]
    : firstReturnLog?.profiles;

  const creatorProfile = Array.isArray(order?.profiles)
    ? order.profiles[0]
    : (order?.profiles || order?.creator || order?.created_by_profile || order?.staff || staffProfile);

  const returnReceiverName = returnReceiverProfile?.full_name
    || returnReceiverProfile?.name
    || creatorProfile?.full_name
    || creatorProfile?.name
    || (typeof staffProfile === 'string' ? staffProfile : staffProfile?.full_name)
    || '...................................................';

  // Resolve digital signature images
  const returnBorrowerSignatureUrl = order?.borrower_signature_url
    || order?.signature_url
    || (Array.isArray(order?.borrower) ? order.borrower[0]?.signature_url : order?.borrower?.signature_url)
    || null;

  const returnReceiverSignatureUrl = returnReceiverProfile?.signature_url
    || creatorProfile?.signature_url
    || staffProfile?.signature_url
    || null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Executive Corporate Header */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Image src="/images/logo.png" style={styles.logo} />
            <View style={styles.companyDetails}>
              <Text style={styles.companyNameTh}>บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</Text>
              <Text style={styles.companyNameEn}>FORTH CORPORATION PUBLIC COMPANY LIMITED</Text>
              <Text style={styles.companyAddress}>
                1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์: 02-265-6700
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.docBadge}>
              <Text style={styles.docBadgeText}>Material Return Report</Text>
            </View>
            <Text style={styles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบรับคืนพัสดุ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        {/* Meta Section */}
        <View style={styles.metaSection}>
          <Text>ผู้ส่งคืน : {order?.borrower_name || '—'}</Text>
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

        {/* Remark Section (Suppressed if redundant/empty) */}
        {effectiveRemark && (
          <View style={{ marginTop: 10, paddingLeft: 10 }} wrap={false}>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
              Remark: <Text style={{ fontWeight: 'normal' }}>{effectiveRemark}</Text>
            </Text>
          </View>
        )}
        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            {returnBorrowerSignatureUrl ? (
              <Image src={returnBorrowerSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({borrowerDisplayName})</Text>
            <Text style={styles.sigRole}>ผู้ส่งคืนพัสดุ</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            {returnReceiverSignatureUrl ? (
              <Image src={returnReceiverSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({returnReceiverName})</Text>
            <Text style={styles.sigRole}>ผู้ตรวจรับคืน</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
};

