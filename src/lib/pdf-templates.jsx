import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { resolveWithdrawalRequester, resolveCheckoutBorrower, resolveDocumentNumber } from '@/lib/pdf-signatures';
import { hasResolvableWarehouse, resolveWarehouseName } from '@/lib/withdrawalStock';
import { resolveStorageUrl } from '@/lib/r2Storage';
import { buildInventoryBalanceReportData, formatReportQuantity } from '@/lib/balanceReportPdfData';
import {
  buildGoodsReceiptReportData,
  buildGoodsIssueReportData,
  buildSiteKitsReportData,
} from '@/lib/reportPdfData';
import {
  sharedReportStyles,
  WarehouseCategoryReportDocument,
  CategoryGroupedReportDocument,
} from '@/lib/pdf-report-shared';

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
  metaColLeft: {
    flex: 1,
    paddingRight: 10,
  },
  metaColRight: {
    flexShrink: 0,
    textAlign: 'right',
  },
  metaValue: {
    fontWeight: 'normal',
    color: '#0f172a',
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
  // Multi-warehouse layout: same table plus a "source warehouse" column.
  colNoWithWh: { width: '6%' },
  colDescWithWh: { width: '40%' },
  colWarehouse: { width: '18%' },
  colSnWithWh: { width: '26%', borderRightWidth: 0 },

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

  // Report columns
  rCol1: { width: '30%' },
  rCol2: { width: '30%' },
  rCol3: { width: '15%', textAlign: 'right' },
  rCol4: { width: '15%', textAlign: 'right' },
  rCol5: { width: '10%', textAlign: 'right' },
});

export const MaterialWithdrawalPDF = ({ order, items, profile, projects = [] }) => {
  // Pad items to at least 15 rows
  const MIN_ROWS = 15;
  const paddedItems = [...items];
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({});
  }

  // Multi-warehouse: show the source warehouse per line once the schema has it.
  const resolveLineWarehouse = (item) => resolveWarehouseName(item, projects);
  const showWarehouseColumn = hasResolvableWarehouse(items, projects);

  const dateStr = order?.requested_at
    ? new Date(order.requested_at).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Resolve requester identity + digital signature (array/object/null safe)
  const { name: requesterName, signatureUrl: rawRequesterSignatureUrl } = resolveWithdrawalRequester(order, profile);
  const requesterSignatureUrl = resolveStorageUrl(rawRequesterSignatureUrl);
  const docNumber = resolveDocumentNumber(order);

  const rawApproverSignatureUrl = (profile?.signature_url && profile?.id !== order?.requested_by ? profile.signature_url : order?.approver?.signature_url)
    || order?.approved_by_profile?.signature_url
    || null;
  const approverSignatureUrl = resolveStorageUrl(rawApproverSignatureUrl);

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
              <Text style={styles.docBadgeText}>MATERIAL WITHDRAWAL REPORT</Text>
            </View>
            <Text style={styles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบเบิกของ</Text>
          <Text style={styles.docCopy}>ต้นฉบับ</Text>
        </View>

        <View style={styles.metaSection}>
          <View style={styles.metaColLeft}>
            <Text>ส่งของที่ : <Text style={styles.metaValue}>{order?.delivery_address || order?.projects?.name || '—'}</Text></Text>
          </View>
          <View style={styles.metaColRight}>
            <Text>เลขที่ใบเบิก : <Text style={styles.metaValue}>{docNumber}</Text></Text>
          </View>
        </View>
        <View style={styles.metaSection}>
          <View style={styles.metaColLeft}>
            <Text>ผู้ขอเบิก : <Text style={styles.metaValue}>{requesterName}</Text></Text>
          </View>
          <View style={styles.metaColRight}>
            <Text>Date. <Text style={styles.metaValue}>{dateStr}</Text></Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <View style={[styles.th, showWarehouseColumn ? styles.colNoWithWh : styles.colNo]}><Text style={styles.thText}>ลำดับ</Text></View>
            <View style={[styles.th, showWarehouseColumn ? styles.colDescWithWh : styles.colDesc]}><Text style={styles.thText}>รายการ</Text></View>
            {showWarehouseColumn && (
              <View style={[styles.th, styles.colWarehouse]}><Text style={styles.thText}>คลังต้นทาง</Text></View>
            )}
            <View style={[styles.th, styles.colQty]}><Text style={styles.thText}>จำนวน</Text></View>
            <View style={[styles.th, showWarehouseColumn ? styles.colSnWithWh : styles.colSn]}><Text style={styles.thText}>Serial Number/Part Number</Text></View>
          </View>

          {paddedItems.map((item, index) => {
            const isEmpty = !item.items;
            const serialPart = [item.serial_number, item.part_number].filter(Boolean).join(' / ');

            return (
              <View key={index} style={[styles.tableRow, index === paddedItems.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.td, showWarehouseColumn ? styles.colNoWithWh : styles.colNo]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : index + 1}</Text>
                </View>
                <View style={[styles.td, showWarehouseColumn ? styles.colDescWithWh : styles.colDesc]}>
                  <Text style={styles.tdText}>{isEmpty ? '' : item.items?.name}</Text>
                </View>
                {showWarehouseColumn && (
                  <View style={[styles.td, styles.colWarehouse]}>
                    <Text style={styles.tdText}>{isEmpty ? '' : (resolveLineWarehouse(item) || '—')}</Text>
                  </View>
                )}
                <View style={[styles.td, styles.colQty]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : `${item.quantity} ${item.items?.unit || ''}`}</Text>
                </View>
                <View style={[styles.td, showWarehouseColumn ? styles.colSnWithWh : styles.colSn]}>
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
            {requesterSignatureUrl ? (
              <Image src={requesterSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({requesterName})</Text>
            <Text style={styles.sigRole}>ผู้ขอเบิกพัสดุ</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            {approverSignatureUrl ? (
              <Image src={approverSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({(profile?.full_name && profile?.id !== order?.requested_by ? profile.full_name : order?.approver?.full_name) || '...................................................'})</Text>
            <Text style={styles.sigRole}>เจ้าหน้าที่ผู้จ่ายพัสดุ</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
};

// ---------------------------------------------------------------------------
// Material Dispatch Note (ใบนำส่งเบิกของ) — รองรับทั้งใบเบิกพัสดุและใบยืม-คืน
// ---------------------------------------------------------------------------
export const MaterialDispatchPDF = ({ order, items = [], profile = null, mode = 'withdrawal', projects = [] }) => {
  if (!order) return null;

  const isCheckout = mode === 'checkout';

  // Multi-warehouse: show the source warehouse per line and keep same-warehouse
  // items together so each warehouse can prepare its own pile.
  const resolveLineWarehouse = (item) => resolveWarehouseName(item, projects);
  const showWarehouseColumn = !isCheckout && hasResolvableWarehouse(items, projects);
  const orderedItems = showWarehouseColumn
    ? [...items].sort((a, b) => String(resolveLineWarehouse(a) || '').localeCompare(String(resolveLineWarehouse(b) || ''), 'th'))
    : [...items];

  // Pad items to at least 15 rows to keep the standardized dispatch paper layout
  const MIN_ROWS = 15;
  const paddedItems = orderedItems;
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({});
  }

  const docDate = isCheckout ? (order?.checkout_date || order?.created_at) : order?.requested_at;
  const dateStr = docDate
    ? new Date(docDate).toLocaleDateString('th-TH')
    : new Date().toLocaleDateString('th-TH');

  const printDateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Requester identity + signature (borrower for checkouts, requisitioner for withdrawals)
  const { name: requesterName, signatureUrl: requesterSignatureUrl } = isCheckout
    ? resolveCheckoutBorrower(order)
    : resolveWithdrawalRequester(order, profile);

  const docNumber = resolveDocumentNumber(order, isCheckout ? 'checkout' : 'withdrawal');

  const destination = isCheckout
    ? (order?.projects?.name || order?.purpose || '—')
    : (order?.delivery_address || order?.projects?.name || order?.purpose || '—');

  const roleLabel = isCheckout ? 'ผู้ขอยืมพัสดุ' : 'ผู้ขอเบิกพัสดุ';

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
              <Text style={styles.docBadgeText}>MATERIAL DISPATCH NOTE</Text>
            </View>
            <Text style={styles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
          </View>
        </View>

        {/* Document Title */}
        <View style={styles.docTitleContainer}>
          <Text style={styles.docTitle}>ใบนำส่งเบิกของ</Text>
          <Text style={styles.docCopy}>ต้นฉบับนำส่ง</Text>
        </View>

        <View style={styles.metaSection}>
          <View style={styles.metaColLeft}>
            <Text>ส่งของที่ / โครงการ : <Text style={styles.metaValue}>{destination}</Text></Text>
          </View>
          <View style={styles.metaColRight}>
            <Text>เลขที่ : <Text style={styles.metaValue}>{docNumber}</Text></Text>
          </View>
        </View>
        <View style={[styles.metaSection, { marginBottom: 10 }]}>
          <View style={styles.metaColLeft}>
            <Text>{isCheckout ? 'ผู้ขอยืม' : 'ผู้ขอเบิก'} : <Text style={styles.metaValue}>{requesterName}</Text></Text>
          </View>
          <View style={styles.metaColRight}>
            <Text>Date. <Text style={styles.metaValue}>{dateStr}</Text></Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <View style={[styles.th, showWarehouseColumn ? styles.colNoWithWh : styles.colNo]}><Text style={styles.thText}>ลำดับ</Text></View>
            <View style={[styles.th, showWarehouseColumn ? styles.colDescWithWh : styles.colDesc]}><Text style={styles.thText}>รายการ</Text></View>
            {showWarehouseColumn && (
              <View style={[styles.th, styles.colWarehouse]}><Text style={styles.thText}>คลังต้นทาง</Text></View>
            )}
            <View style={[styles.th, styles.colQty]}><Text style={styles.thText}>จำนวน</Text></View>
            <View style={[styles.th, showWarehouseColumn ? styles.colSnWithWh : styles.colSn]}><Text style={styles.thText}>Serial Number / หมายเหตุ</Text></View>
          </View>

          {paddedItems.map((item, index) => {
            const isEmpty = isCheckout
              ? (!item.item_id && !item.items && !item.quantity_borrowed)
              : !item.items;
            const itemName = item.items?.name || item.item_name || '';
            const qty = isCheckout ? item.quantity_borrowed : item.quantity;
            const unit = item.items?.unit || (isCheckout ? 'ชิ้น' : '');
            const serialNotes = [
              item.serial_number,
              item.part_number,
              item.condition_on_checkout && item.condition_on_checkout !== 'normal' ? `(${item.condition_on_checkout})` : null,
              item.notes
            ].filter(Boolean).join(' / ');

            return (
              <View key={index} style={[styles.tableRow, index === paddedItems.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.td, showWarehouseColumn ? styles.colNoWithWh : styles.colNo]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : index + 1}</Text>
                </View>
                <View style={[styles.td, showWarehouseColumn ? styles.colDescWithWh : styles.colDesc]}>
                  <Text style={styles.tdText}>{isEmpty ? '' : itemName}</Text>
                </View>
                {showWarehouseColumn && (
                  <View style={[styles.td, styles.colWarehouse]}>
                    <Text style={styles.tdText}>{isEmpty ? '' : (resolveLineWarehouse(item) || '—')}</Text>
                  </View>
                )}
                <View style={[styles.td, styles.colQty]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : `${qty} ${unit}`.trim()}</Text>
                </View>
                <View style={[styles.td, showWarehouseColumn ? styles.colSnWithWh : styles.colSn]}>
                  <Text style={styles.tdTextCenter}>{isEmpty ? '' : (serialNotes || '—')}</Text>
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

        {/* Signatures: right box stays blank for a wet signature at the source warehouse */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            {requesterSignatureUrl ? (
              <Image src={requesterSignatureUrl} style={styles.sigImage} />
            ) : (
              <View style={styles.sigSpacer} />
            )}
            <Text style={styles.sigName}>({requesterName})</Text>
            <Text style={styles.sigRole}>{roleLabel}</Text>
            <Text style={styles.sigDate}>วันที่: ....../....../...........</Text>
          </View>

          <View style={styles.signatureBox}>
            <View style={styles.sigSpacer} />
            <Text style={styles.sigName}>(...................................................)</Text>
            <Text style={styles.sigRole}>เจ้าหน้าที่ผู้จ่ายพัสดุ</Text>
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
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  filterChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 4,
    marginVertical: 1
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
  warehouseName = '',
  categoryName = '',
  startDate = '',
  endDate = '',
  searchQuery: _searchQuery = ''
}) => {
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
          <View style={[reportStyles.th, { width: '4%' }]}><Text style={reportStyles.thText}>ลำดับ</Text></View>
          <View style={[reportStyles.th, { width: '11%' }]}><Text style={reportStyles.thText}>วันที่เบิก</Text></View>
          <View style={[reportStyles.th, { width: '18%' }]}><Text style={reportStyles.thText}>โครงการ</Text></View>
          <View style={[reportStyles.th, { width: '22%' }]}><Text style={reportStyles.thText}>รายการวัสดุ</Text></View>
          <View style={[reportStyles.th, { width: '7%' }]}><Text style={reportStyles.thText}>ขอเบิก</Text></View>
          <View style={[reportStyles.th, { width: '7%' }]}><Text style={reportStyles.thText}>ตัดจริง</Text></View>
          <View style={[reportStyles.th, { width: '5%' }]}><Text style={reportStyles.thText}>หน่วย</Text></View>
          <View style={[reportStyles.th, { width: '18%' }]}><Text style={reportStyles.thText}>ที่มา / เลขอ้างอิง</Text></View>
          <View style={[reportStyles.th, { width: '8%', borderRightWidth: 0 }]}><Text style={reportStyles.thText}>ผู้เบิก</Text></View>
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
        // "ที่มา": withdrawal request vs loan item consumed as a replacement (migration 77)
        const sourceLabel = row.source === 'checkout_consumed' ? 'ยืม → ใช้ทดแทน' : 'ใบเบิก';

        return (
          <View key={idx} style={rowStyle} wrap={false}>
            <View style={[reportStyles.td, { width: '4%' }]}><Text style={reportStyles.tdTextCenter}>{idx + 1}</Text></View>
            <View style={[reportStyles.td, { width: '11%' }]}><Text style={reportStyles.tdTextCenter}>{reqDate}</Text></View>
            <View style={[reportStyles.td, { width: '18%' }]}><Text style={reportStyles.tdText}>{projName}</Text></View>
            <View style={[reportStyles.td, { width: '22%' }]}><Text style={reportStyles.tdTextBold}>{row.items?.name || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '7%' }]}><Text style={reportStyles.tdTextCenter}>{row.quantity || 0}</Text></View>
            <View style={[reportStyles.td, { width: '7%' }]}><Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>{deducted}</Text></View>
            <View style={[reportStyles.td, { width: '5%' }]}><Text style={reportStyles.tdTextCenter}>{row.items?.unit || '-'}</Text></View>
            <View style={[reportStyles.td, { width: '18%' }]}>
              <Text style={reportStyles.tdTextCenter}>{sourceLabel}</Text>
              {row.reference ? <Text style={{ fontSize: 7, textAlign: 'center', color: '#64748b' }}>{row.reference}</Text> : null}
            </View>
            <View style={[reportStyles.td, { width: '8%', borderRightWidth: 0 }]}><Text style={reportStyles.tdTextCenter}>{requester}</Text></View>
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
          <View style={[reportStyles.td, { width: '55%', justifyContent: 'center' }]}>
            <Text style={[reportStyles.tfText, { textAlign: 'right', paddingRight: 6 }]}>รวมยอดเบิกจ่ายทั้งสิ้น:</Text>
          </View>
          <View style={[reportStyles.td, { width: '7%' }]}>
            <Text style={reportStyles.tdTextCenter}>{totalInQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '7%' }]}>
            <Text style={[reportStyles.tdTextCenter, reportStyles.stockInText]}>{totalOutQty}</Text>
          </View>
          <View style={[reportStyles.td, { width: '31%', borderRightWidth: 0 }]}>
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
                1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์: 02-265-6700
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
            {warehouseName ? (
              <View style={reportStyles.filterChip}>
                <Text style={reportStyles.filterChipText}>คลังพัสดุ: {warehouseName}</Text>
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

// ---------------------------------------------------------------------------
// Report #1: Goods Receipt Report (รายงานรับเข้าพัสดุ) — 5 Warehouses × 6 Categories
// ---------------------------------------------------------------------------
export const GoodsReceiptReportPDF = ({
  data = [],
  projects = [],
  categories = [],
  logoSrc = '/images/logo.png',
}) => {
  const report = buildGoodsReceiptReportData(data, { projects, categories });
  const { warehouses, grandTotal, unmappedWarehouseCount } = report;

  const columns = [
    {
      key: 'index',
      label: 'ลำดับ',
      width: '6%',
      render: (_item, idx) => <Text style={sharedReportStyles.tdTextCenter}>{idx + 1}</Text>,
    },
    {
      key: 'receivedDate',
      label: 'วันที่รับเข้า',
      width: '12%',
      render: (item) => <Text style={sharedReportStyles.tdTextCenter}>{item.receivedDate}</Text>,
    },
    {
      key: 'documentNumber',
      label: 'เลขที่เอกสาร / PO',
      width: '16%',
      render: (item) => <Text style={sharedReportStyles.tdText}>{item.documentNumber}</Text>,
    },
    {
      key: 'itemName',
      label: 'รายการวัสดุ',
      width: '32%',
      render: (item) => <Text style={sharedReportStyles.tdTextBold}>{item.itemName}</Text>,
    },
    {
      key: 'supplier',
      label: 'ผู้จำหน่าย',
      width: '14%',
      render: (item) => <Text style={sharedReportStyles.tdText}>{item.supplier}</Text>,
    },
    {
      key: 'unit',
      label: 'หน่วย',
      width: '8%',
      render: (item) => <Text style={sharedReportStyles.tdTextCenter}>{item.unit || '-'}</Text>,
    },
    {
      key: 'quantity',
      label: 'จำนวนรับเข้า',
      width: '12%',
      render: (item) => (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
          +{formatReportQuantity(item.quantity)}
        </Text>
      ),
    },
  ];

  const kpiCards = [
    {
      key: 'items',
      label: 'จำนวนรายการทั้งหมด (ITEMS)',
      value: `${formatReportQuantity(grandTotal.itemCount)} รายการ`,
    },
    {
      key: 'totalQty',
      label: 'ยอดรับเข้าสะสม (TOTAL RECEIVED)',
      value: `+${formatReportQuantity(grandTotal.totalQty)}`,
      color: '#059669',
    },
    {
      key: 'documents',
      label: 'เอกสารอ้างอิง (DOCUMENTS)',
      value: `${formatReportQuantity(grandTotal.documentCount)} เอกสาร`,
      color: '#1e40af',
    },
    {
      key: 'suppliers',
      label: 'ผู้จำหน่าย (SUPPLIERS)',
      value: `${formatReportQuantity(grandTotal.supplierCount)} ราย`,
    },
    {
      key: 'activeWarehouses',
      label: 'คลังที่รับเข้า (WAREHOUSES)',
      value: `${grandTotal.activeWarehouseCount} / ${warehouses.length} คลัง`,
      color: '#0369a1',
    },
  ];

  const grandTotalColumns = [
    { key: 'warehouse', label: 'คลังพัสดุ', width: '48%' },
    { key: 'items', label: 'จำนวนรายการ', width: '18%' },
    { key: 'documents', label: 'เอกสารอ้างอิง', width: '16%' },
    { key: 'totalQty', label: 'จำนวนรับเข้ารวม', width: '18%' },
  ];

  return (
    <WarehouseCategoryReportDocument
      logoSrc={logoSrc}
      badgeText="GOODS RECEIPT REPORT"
      reportTitle="รายงานรับเข้าพัสดุ (Goods Receipt Report)"
      kpiCards={kpiCards}
      warehouses={warehouses}
      columns={columns}
      emptyLabel="ไม่มีข้อมูล (No data)"
      subtotalLabelWidth="88%"
      getWarehouseSummaryText={(wh) =>
        `${formatReportQuantity(wh.subtotal.itemCount)} รายการ | รับเข้า +${formatReportQuantity(wh.subtotal.totalQty)}`
      }
      getCategorySubtotalCells={(cat) => [
        {
          key: 'totalQty',
          width: '12%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
              +{formatReportQuantity(cat.subtotal.totalQty)}
            </Text>
          ),
        },
      ]}
      getWarehouseSubtotalCells={(wh) => [
        {
          key: 'totalQty',
          width: '12%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
              +{formatReportQuantity(wh.subtotal.totalQty)}
            </Text>
          ),
        },
      ]}
      grandTotalTitle="สรุปยอดรับเข้าสุทธิทั้งหมด 5 คลัง (Grand Total Summary)"
      grandTotalCountText={`${formatReportQuantity(grandTotal.itemCount)} รายการ`}
      grandTotalColumns={grandTotalColumns}
      getGrandTotalRows={(whs) =>
        whs.map((whSummary) => ({
          key: `summary-${whSummary.key}`,
          cells: [
            {
              key: 'wh',
              content: (
                <Text style={sharedReportStyles.tdTextBold}>
                  {whSummary.order}. {whSummary.label}
                </Text>
              ),
            },
            {
              key: 'items',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {whSummary.subtotal.itemCount === 0
                    ? 'ไม่มีข้อมูล (No data)'
                    : `${formatReportQuantity(whSummary.subtotal.itemCount)} รายการ`}
                </Text>
              ),
            },
            {
              key: 'docs',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {formatReportQuantity(whSummary.subtotal.documentCount)} เอกสาร
                </Text>
              ),
            },
            {
              key: 'totalQty',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
                  +{formatReportQuantity(whSummary.subtotal.totalQty)}
                </Text>
              ),
            },
          ],
        }))
      }
      grandTotalFooterCells={[
        {
          key: 'label',
          content: (
            <Text style={sharedReportStyles.warehouseSubtotalLabel}>
              รวมยอดสุทธิทั้งหมด (Grand Total)
            </Text>
          ),
        },
        {
          key: 'items',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.itemCount)} รายการ
            </Text>
          ),
        },
        {
          key: 'docs',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.documentCount)} เอกสาร
            </Text>
          ),
        },
        {
          key: 'totalQty',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
              +{formatReportQuantity(grandTotal.totalQty)}
            </Text>
          ),
        },
      ]}
      unmappedWarehouseCount={unmappedWarehouseCount}
    />
  );
};

// ---------------------------------------------------------------------------
// Report #2: Goods Issue / Requisition Report (รายงานการเบิกจ่าย) — 5 Warehouses × 6 Categories
// ---------------------------------------------------------------------------
export const GoodsIssueReportPDF = ({
  data = [],
  projects = [],
  categories = [],
  itemsByName = null,
  logoSrc = '/images/logo.png',
}) => {
  const report = buildGoodsIssueReportData(data, { projects, categories, itemsByName });
  const { warehouses, grandTotal, unmappedWarehouseCount } = report;

  const columns = [
    {
      key: 'index',
      label: 'ลำดับ',
      width: '6%',
      render: (_item, idx) => <Text style={sharedReportStyles.tdTextCenter}>{idx + 1}</Text>,
    },
    {
      key: 'issueDate',
      label: 'วันที่เบิก',
      width: '11%',
      render: (item) => <Text style={sharedReportStyles.tdTextCenter}>{item.issueDate}</Text>,
    },
    {
      key: 'documentNumber',
      label: 'เลขที่เอกสาร',
      width: '14%',
      render: (item) => <Text style={sharedReportStyles.tdText}>{item.documentNumber}</Text>,
    },
    {
      key: 'itemName',
      label: 'รายการวัสดุ',
      width: '29%',
      render: (item) => <Text style={sharedReportStyles.tdTextBold}>{item.itemName}</Text>,
    },
    {
      key: 'requester',
      label: 'ผู้ขอเบิก',
      width: '14%',
      render: (item) => <Text style={sharedReportStyles.tdText}>{item.requester}</Text>,
    },
    {
      key: 'unit',
      label: 'หน่วย',
      width: '6%',
      render: (item) => <Text style={sharedReportStyles.tdTextCenter}>{item.unit || '-'}</Text>,
    },
    {
      key: 'requestedQty',
      label: 'ขอเบิก',
      width: '10%',
      render: (item) => (
        <Text style={sharedReportStyles.tdTextRight}>
          {formatReportQuantity(item.requestedQty)}
        </Text>
      ),
    },
    {
      key: 'deductedQty',
      label: 'จ่ายจริง',
      width: '10%',
      render: (item) => (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
          -{formatReportQuantity(item.deductedQty)}
        </Text>
      ),
    },
  ];

  const kpiCards = [
    {
      key: 'items',
      label: 'จำนวนรายการทั้งหมด (ITEMS)',
      value: `${formatReportQuantity(grandTotal.itemCount)} รายการ`,
    },
    {
      key: 'requested',
      label: 'ยอดขอเบิกสะสม (REQUESTED)',
      value: formatReportQuantity(grandTotal.requestedQty),
    },
    {
      key: 'deducted',
      label: 'ยอดตัดจ่ายจริง (ISSUED)',
      value: `-${formatReportQuantity(grandTotal.deductedQty)}`,
      color: '#dc2626',
    },
    {
      key: 'shortage',
      label: 'ยอดขาดสต็อก (SHORTAGE)',
      value: formatReportQuantity(grandTotal.shortageQty),
      color: grandTotal.shortageQty > 0 ? '#d97706' : '#059669',
    },
    {
      key: 'documents',
      label: 'เอกสารเบิก (DOCUMENTS)',
      value: `${formatReportQuantity(grandTotal.documentCount)} เอกสาร`,
      color: '#1e40af',
    },
  ];

  const grandTotalColumns = [
    { key: 'warehouse', label: 'คลังพัสดุ', width: '46%' },
    { key: 'items', label: 'จำนวนรายการ', width: '16%' },
    { key: 'documents', label: 'เอกสารเบิก', width: '14%' },
    { key: 'requested', label: 'ขอเบิกรวม', width: '12%' },
    { key: 'deducted', label: 'จ่ายจริงรวม', width: '12%' },
  ];

  return (
    <WarehouseCategoryReportDocument
      logoSrc={logoSrc}
      badgeText="GOODS ISSUE REPORT"
      reportTitle="รายงานการเบิกจ่ายพัสดุ (Goods Issue / Requisition Report)"
      kpiCards={kpiCards}
      warehouses={warehouses}
      columns={columns}
      emptyLabel="ไม่มีข้อมูล (No data)"
      subtotalLabelWidth="80%"
      getWarehouseSummaryText={(wh) =>
        `${formatReportQuantity(wh.subtotal.itemCount)} รายการ | จ่ายจริง -${formatReportQuantity(wh.subtotal.deductedQty)}`
      }
      getCategorySubtotalCells={(cat) => [
        {
          key: 'requested',
          width: '10%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(cat.subtotal.requestedQty)}
            </Text>
          ),
        },
        {
          key: 'deducted',
          width: '10%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
              -{formatReportQuantity(cat.subtotal.deductedQty)}
            </Text>
          ),
        },
      ]}
      getWarehouseSubtotalCells={(wh) => [
        {
          key: 'requested',
          width: '10%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(wh.subtotal.requestedQty)}
            </Text>
          ),
        },
        {
          key: 'deducted',
          width: '10%',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
              -{formatReportQuantity(wh.subtotal.deductedQty)}
            </Text>
          ),
        },
      ]}
      grandTotalTitle="สรุปยอดเบิกจ่ายสุทธิทั้งหมด 5 คลัง (Grand Total Summary)"
      grandTotalCountText={`${formatReportQuantity(grandTotal.itemCount)} รายการ`}
      grandTotalColumns={grandTotalColumns}
      getGrandTotalRows={(whs) =>
        whs.map((whSummary) => ({
          key: `summary-${whSummary.key}`,
          cells: [
            {
              key: 'wh',
              content: (
                <Text style={sharedReportStyles.tdTextBold}>
                  {whSummary.order}. {whSummary.label}
                </Text>
              ),
            },
            {
              key: 'items',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {whSummary.subtotal.itemCount === 0
                    ? 'ไม่มีข้อมูล (No data)'
                    : `${formatReportQuantity(whSummary.subtotal.itemCount)} รายการ`}
                </Text>
              ),
            },
            {
              key: 'docs',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {formatReportQuantity(whSummary.subtotal.documentCount)} เอกสาร
                </Text>
              ),
            },
            {
              key: 'requested',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.tdTextBold]}>
                  {formatReportQuantity(whSummary.subtotal.requestedQty)}
                </Text>
              ),
            },
            {
              key: 'deducted',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
                  -{formatReportQuantity(whSummary.subtotal.deductedQty)}
                </Text>
              ),
            },
          ],
        }))
      }
      grandTotalFooterCells={[
        {
          key: 'label',
          content: (
            <Text style={sharedReportStyles.warehouseSubtotalLabel}>
              รวมยอดสุทธิทั้งหมด (Grand Total)
            </Text>
          ),
        },
        {
          key: 'items',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.itemCount)} รายการ
            </Text>
          ),
        },
        {
          key: 'docs',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.documentCount)} เอกสาร
            </Text>
          ),
        },
        {
          key: 'requested',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.requestedQty)}
            </Text>
          ),
        },
        {
          key: 'deducted',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
              -{formatReportQuantity(grandTotal.deductedQty)}
            </Text>
          ),
        },
      ]}
      unmappedWarehouseCount={unmappedWarehouseCount}
    />
  );
};

// ---------------------------------------------------------------------------
// Report #4: BOM Spec & Site Kits Readiness Report (สเปก BOM และความพร้อม Site Kits)
// Grouped by the 6 canonical equipment categories across all 5 warehouses.
// ---------------------------------------------------------------------------
export const SiteKitsReportPDF = ({
  items = [],
  siteKits = [],
  logoSrc = '/images/logo.png',
}) => {
  const report = buildSiteKitsReportData(siteKits, { items });
  const { categories, grandTotal } = report;

  const columns = [
    {
      key: 'index',
      label: 'ลำดับ',
      width: '6%',
      render: (_item, idx) => <Text style={sharedReportStyles.tdTextCenter}>{idx + 1}</Text>,
    },
    {
      key: 'partNumber',
      label: 'Part Number',
      width: '16%',
      render: (item) => <Text style={sharedReportStyles.tdTextBold}>{item.partNumber}</Text>,
    },
    {
      key: 'bomName',
      label: 'รายการอุปกรณ์ตาม BOM',
      width: '30%',
      render: (item) => <Text style={sharedReportStyles.tdText}>{item.bomName}</Text>,
    },
    {
      key: 'qtyPerSite',
      label: 'สเปก/ไซต์',
      width: '10%',
      render: (item) => (
        <Text style={sharedReportStyles.tdTextRight}>
          {formatReportQuantity(item.qtyPerSite)} {item.unit}
        </Text>
      ),
    },
    {
      key: 'totalStock',
      label: 'สต็อกจริง',
      width: '10%',
      render: (item) => (
        <Text
          style={[
            sharedReportStyles.tdTextRight,
            item.status === 'out_of_stock'
              ? sharedReportStyles.stockOutText
              : sharedReportStyles.balanceText,
          ]}
        >
          {formatReportQuantity(item.totalStock)}
        </Text>
      ),
    },
    {
      key: 'setsPossible',
      label: 'จัดได้',
      width: '9%',
      render: (item) => (
        <Text
          style={[
            sharedReportStyles.tdTextRight,
            item.status === 'out_of_stock'
              ? sharedReportStyles.stockOutText
              : item.status === 'limiting'
                ? sharedReportStyles.warningText
                : sharedReportStyles.stockInText,
          ]}
        >
          {formatReportQuantity(item.setsPossible)} ชุด
        </Text>
      ),
    },
    {
      key: 'missing',
      label: 'ขาด',
      width: '8%',
      render: (item) => (
        <Text
          style={[
            sharedReportStyles.tdTextRight,
            item.missingForNextSet > 0
              ? sharedReportStyles.stockOutText
              : sharedReportStyles.balanceZeroText,
          ]}
        >
          {item.missingForNextSet > 0 ? `-${formatReportQuantity(item.missingForNextSet)}` : '0'}
        </Text>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      width: '11%',
      render: (item) => {
        const statusColor =
          item.status === 'out_of_stock'
            ? '#dc2626'
            : item.status === 'limiting'
              ? '#d97706'
              : '#059669';
        return (
          <Text
            style={[
              sharedReportStyles.tdTextCenter,
              { color: statusColor, fontWeight: 'bold', fontSize: 8 },
            ]}
          >
            {item.statusLabel}
          </Text>
        );
      },
    },
  ];

  const kpiCards = [
    {
      key: 'bomItems',
      label: 'รายการตาม BOM (ITEMS)',
      value: `${formatReportQuantity(grandTotal.itemCount)} รายการ`,
    },
    {
      key: 'completeSets',
      label: 'ชุดพร้อมจัดรวม (READY SETS)',
      value: `${formatReportQuantity(grandTotal.totalCompleteSets)} ชุด`,
      color: grandTotal.totalCompleteSets > 0 ? '#059669' : '#dc2626',
    },
    {
      key: 'totalStock',
      label: 'สต็อกจริงรวม (TOTAL STOCK)',
      value: formatReportQuantity(grandTotal.totalStock),
      color: '#1e40af',
    },
    {
      key: 'limiting',
      label: 'สต็อกจำกัด (LIMITING)',
      value: `${formatReportQuantity(grandTotal.limitingCount)} รายการ`,
      color: grandTotal.limitingCount > 0 ? '#d97706' : '#059669',
    },
    {
      key: 'outOfStock',
      label: 'หมดสต็อก (OUT OF STOCK)',
      value: `${formatReportQuantity(grandTotal.outOfStockCount)} รายการ`,
      color: grandTotal.outOfStockCount > 0 ? '#dc2626' : '#059669',
    },
  ];

  const grandTotalColumns = [
    { key: 'category', label: 'หมวดหมู่อุปกรณ์', width: '36%' },
    { key: 'items', label: 'รายการ BOM', width: '14%' },
    { key: 'sets', label: 'ชุดพร้อมจัด', width: '14%' },
    { key: 'stock', label: 'สต็อกรวม', width: '12%' },
    { key: 'limiting', label: 'สต็อกจำกัด', width: '12%' },
    { key: 'outOfStock', label: 'หมดสต็อก', width: '12%' },
  ];

  return (
    <CategoryGroupedReportDocument
      logoSrc={logoSrc}
      badgeText="SITE KITS BOM REPORT"
      reportTitle="รายงานสเปก BOM และความพร้อม Site Kits (Site Kits Readiness Report)"
      scopeText="ขอบเขต: ทุกคลังรวม (5 คลัง) / ทุกหมวดหมู่ (6 หมวดหมู่)"
      sectionBannerTitle="สรุปสเปก BOM และความพร้อมชุดติดตั้ง (ทุกคลังรวม 5 คลัง)"
      sectionBannerMeta={
        grandTotal.itemCount === 0
          ? 'ไม่มีข้อมูล (No data)'
          : `${formatReportQuantity(grandTotal.itemCount)} รายการ | พร้อมจัดรวม ${formatReportQuantity(grandTotal.totalCompleteSets)} ชุด`
      }
      kpiCards={kpiCards}
      categories={categories}
      columns={columns}
      emptyLabel="ไม่มีข้อมูล (No data)"
      subtotalLabelWidth="52%"
      getCategoryCountText={(cat) =>
        `${formatReportQuantity(cat.subtotal.completeSets)} ชุดพร้อมจัด | ${formatReportQuantity(cat.subtotal.itemCount)} รายการ`
      }
      getCategorySubtotalCells={(cat) => {
        const isEmpty = cat.subtotal.itemCount === 0;
        const catReady = !isEmpty && cat.subtotal.completeSets > 0;
        return [
          {
            key: 'qtyPerSite',
            width: '10%',
            content: <Text style={sharedReportStyles.tdTextRight}>-</Text>,
          },
          {
            key: 'totalStock',
            width: '10%',
            content: (
              <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
                {formatReportQuantity(cat.subtotal.totalStock)}
              </Text>
            ),
          },
          {
            key: 'sets',
            width: '9%',
            content: (
              <Text
                style={[
                  sharedReportStyles.tdTextRight,
                  catReady ? sharedReportStyles.stockInText : sharedReportStyles.stockOutText,
                ]}
              >
                {formatReportQuantity(cat.subtotal.completeSets)} ชุด
              </Text>
            ),
          },
          {
            key: 'missing',
            width: '8%',
            content: (
              <Text
                style={[
                  sharedReportStyles.tdTextRight,
                  cat.subtotal.totalMissing > 0
                    ? sharedReportStyles.stockOutText
                    : sharedReportStyles.balanceZeroText,
                ]}
              >
                {cat.subtotal.totalMissing > 0
                  ? `-${formatReportQuantity(cat.subtotal.totalMissing)}`
                  : '0'}
              </Text>
            ),
          },
          {
            key: 'status',
            width: '11%',
            content: (
              <Text
                style={[
                  sharedReportStyles.tdTextCenter,
                  {
                    color: isEmpty ? '#94a3b8' : catReady ? '#059669' : '#dc2626',
                    fontWeight: 'bold',
                    fontSize: 8,
                  },
                ]}
              >
                {isEmpty ? '-' : catReady ? 'พร้อมจัด' : 'ไม่พร้อม'}
              </Text>
            ),
          },
        ];
      }}
      grandTotalTitle="สรุปความพร้อม Site Kits ทั้งหมด 6 หมวดหมู่ (Grand Total Summary)"
      grandTotalCountText={`${formatReportQuantity(grandTotal.itemCount)} รายการ`}
      grandTotalColumns={grandTotalColumns}
      getGrandTotalRows={(cats) =>
        cats.map((catSummary) => ({
          key: `summary-${catSummary.key}`,
          cells: [
            {
              key: 'cat',
              content: (
                <Text style={sharedReportStyles.tdTextBold}>
                  {catSummary.order}. {catSummary.label}
                </Text>
              ),
            },
            {
              key: 'items',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {catSummary.subtotal.itemCount === 0
                    ? 'ไม่มีข้อมูล (No data)'
                    : `${formatReportQuantity(catSummary.subtotal.itemCount)} รายการ`}
                </Text>
              ),
            },
            {
              key: 'sets',
              content: (
                <Text
                  style={[
                    sharedReportStyles.tdTextRight,
                    catSummary.subtotal.completeSets > 0
                      ? sharedReportStyles.stockInText
                      : sharedReportStyles.stockOutText,
                  ]}
                >
                  {formatReportQuantity(catSummary.subtotal.completeSets)} ชุด
                </Text>
              ),
            },
            {
              key: 'stock',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
                  {formatReportQuantity(catSummary.subtotal.totalStock)}
                </Text>
              ),
            },
            {
              key: 'limiting',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.warningText]}>
                  {formatReportQuantity(catSummary.subtotal.limitingCount)}
                </Text>
              ),
            },
            {
              key: 'outOfStock',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
                  {formatReportQuantity(catSummary.subtotal.outOfStockCount)}
                </Text>
              ),
            },
          ],
        }))
      }
      grandTotalFooterCells={[
        {
          key: 'label',
          content: (
            <Text style={sharedReportStyles.warehouseSubtotalLabel}>
              รวมยอดสุทธิทั้งหมด (Grand Total)
            </Text>
          ),
        },
        {
          key: 'items',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.itemCount)} รายการ
            </Text>
          ),
        },
        {
          key: 'sets',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
              {formatReportQuantity(grandTotal.totalCompleteSets)} ชุด
            </Text>
          ),
        },
        {
          key: 'stock',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
              {formatReportQuantity(grandTotal.totalStock)}
            </Text>
          ),
        },
        {
          key: 'limiting',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.warningText]}>
              {formatReportQuantity(grandTotal.limitingCount)}
            </Text>
          ),
        },
        {
          key: 'outOfStock',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
              {formatReportQuantity(grandTotal.outOfStockCount)}
            </Text>
          ),
        },
      ]}
      footerNote="หมายเหตุ: รายงานสเปก BOM และความพร้อม Site Kits คำนวณความพร้อมจากยอดสต็อกรวมทุกคลัง (5 คลัง) และจัดกลุ่มตามหมวดหมู่อุปกรณ์มาตรฐาน 6 หมวดหมู่"
    />
  );
};

// ---------------------------------------------------------------------------
// Inventory Balance Report (#3) — All 5 Warehouses × All 6 Categories
// ---------------------------------------------------------------------------
export const InventoryBalanceReportPDF = ({
  data = [],
  projects = [],
  categories = [],
  logoSrc = '/images/logo.png',
}) => {
  const report = buildInventoryBalanceReportData(data, { projects, categories });
  const { warehouses, grandTotal, unmappedWarehouseCount } = report;

  const columns = [
    {
      key: 'index',
      label: 'ลำดับ',
      width: '6%',
      render: (_item, idx) => <Text style={sharedReportStyles.tdTextCenter}>{idx + 1}</Text>,
    },
    {
      key: 'itemName',
      label: 'รายการวัสดุ',
      width: '50%',
      render: (item) => <Text style={sharedReportStyles.tdTextBold}>{item.itemName}</Text>,
    },
    {
      key: 'unit',
      label: 'หน่วย',
      width: '8%',
      render: (item) => <Text style={sharedReportStyles.tdTextCenter}>{item.unit || '-'}</Text>,
    },
    {
      key: 'totalIn',
      label: 'รับเข้าทั้งหมด',
      width: '12%',
      render: (item) => (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
          +{formatReportQuantity(item.totalIn)}
        </Text>
      ),
    },
    {
      key: 'totalOut',
      label: 'เบิกออกทั้งหมด',
      width: '12%',
      render: (item) => (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
          -{formatReportQuantity(item.totalOut)}
        </Text>
      ),
    },
    {
      key: 'balance',
      label: 'คงเหลือ',
      width: '12%',
      render: (item) => (
        <Text
          style={[
            sharedReportStyles.tdTextRight,
            item.balance <= 0 ? sharedReportStyles.balanceZeroText : sharedReportStyles.balanceText,
          ]}
        >
          {formatReportQuantity(item.balance)}
        </Text>
      ),
    },
  ];

  const kpiCards = [
    {
      key: 'items',
      label: 'จำนวนรายการทั้งหมด (ITEMS)',
      value: `${formatReportQuantity(grandTotal.itemCount)} รายการ`,
    },
    {
      key: 'totalIn',
      label: 'รับเข้าสะสม (TOTAL IN)',
      value: `+${formatReportQuantity(grandTotal.totalIn)}`,
      color: '#059669',
    },
    {
      key: 'totalOut',
      label: 'เบิกออกสะสม (TOTAL OUT)',
      value: `-${formatReportQuantity(grandTotal.totalOut)}`,
      color: '#dc2626',
    },
    {
      key: 'balance',
      label: 'คงเหลือสุทธิ (NET BALANCE)',
      value: formatReportQuantity(grandTotal.balance),
      color: '#1e40af',
    },
    {
      key: 'zeroStock',
      label: 'สต็อกหมด (OUT OF STOCK)',
      value: `${formatReportQuantity(grandTotal.zeroStockCount)} รายการ`,
      color: grandTotal.zeroStockCount > 0 ? '#ea580c' : '#059669',
    },
  ];

  const grandTotalColumns = [
    { key: 'warehouse', label: 'คลังพัสดุ', width: '48%' },
    { key: 'items', label: 'จำนวนรายการ', width: '16%' },
    { key: 'totalIn', label: 'รับเข้าทั้งหมด', width: '12%' },
    { key: 'totalOut', label: 'เบิกออกทั้งหมด', width: '12%' },
    { key: 'balance', label: 'คงเหลือ', width: '12%' },
  ];

  const renderBalanceSubtotalCells = (subtotal) => [
    {
      key: 'totalIn',
      width: '12%',
      content: (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
          +{formatReportQuantity(subtotal.totalIn)}
        </Text>
      ),
    },
    {
      key: 'totalOut',
      width: '12%',
      content: (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
          -{formatReportQuantity(subtotal.totalOut)}
        </Text>
      ),
    },
    {
      key: 'balance',
      width: '12%',
      content: (
        <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
          {formatReportQuantity(subtotal.balance)}
        </Text>
      ),
    },
  ];

  return (
    <WarehouseCategoryReportDocument
      logoSrc={logoSrc}
      badgeText="INVENTORY BALANCE REPORT"
      reportTitle="รายงานสรุปยอดพัสดุคงเหลือ (Inventory Balance Report)"
      kpiCards={kpiCards}
      warehouses={warehouses}
      columns={columns}
      emptyLabel="ไม่มีสต็อก (No stock)"
      subtotalLabelWidth="64%"
      getWarehouseSummaryText={(wh) =>
        `${formatReportQuantity(wh.subtotal.itemCount)} รายการ | คงเหลือ ${formatReportQuantity(wh.subtotal.balance)}`
      }
      getCategorySubtotalCells={(cat) => renderBalanceSubtotalCells(cat.subtotal)}
      getWarehouseSubtotalCells={(wh) => renderBalanceSubtotalCells(wh.subtotal)}
      grandTotalTitle="สรุปยอดรวมสุทธิทั้งหมด 5 คลัง (Grand Total Summary)"
      grandTotalCountText={`${formatReportQuantity(grandTotal.itemCount)} รายการ`}
      grandTotalColumns={grandTotalColumns}
      getGrandTotalRows={(whs) =>
        whs.map((whSummary) => ({
          key: `summary-${whSummary.key}`,
          cells: [
            {
              key: 'wh',
              content: (
                <Text style={sharedReportStyles.tdTextBold}>
                  {whSummary.order}. {whSummary.label}
                </Text>
              ),
            },
            {
              key: 'items',
              content: (
                <Text style={sharedReportStyles.tdTextCenter}>
                  {whSummary.subtotal.itemCount === 0
                    ? 'ไม่มีสต็อก (No stock)'
                    : `${formatReportQuantity(whSummary.subtotal.itemCount)} รายการ`}
                </Text>
              ),
            },
            {
              key: 'totalIn',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
                  +{formatReportQuantity(whSummary.subtotal.totalIn)}
                </Text>
              ),
            },
            {
              key: 'totalOut',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
                  -{formatReportQuantity(whSummary.subtotal.totalOut)}
                </Text>
              ),
            },
            {
              key: 'balance',
              content: (
                <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
                  {formatReportQuantity(whSummary.subtotal.balance)}
                </Text>
              ),
            },
          ],
        }))
      }
      grandTotalFooterCells={[
        {
          key: 'label',
          content: (
            <Text style={sharedReportStyles.warehouseSubtotalLabel}>
              รวมยอดสุทธิทั้งหมด (Grand Total)
            </Text>
          ),
        },
        {
          key: 'items',
          content: (
            <Text style={[sharedReportStyles.tdTextCenter, sharedReportStyles.tdTextBold]}>
              {formatReportQuantity(grandTotal.itemCount)} รายการ
            </Text>
          ),
        },
        {
          key: 'totalIn',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockInText]}>
              +{formatReportQuantity(grandTotal.totalIn)}
            </Text>
          ),
        },
        {
          key: 'totalOut',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.stockOutText]}>
              -{formatReportQuantity(grandTotal.totalOut)}
            </Text>
          ),
        },
        {
          key: 'balance',
          content: (
            <Text style={[sharedReportStyles.tdTextRight, sharedReportStyles.balanceText]}>
              {formatReportQuantity(grandTotal.balance)}
            </Text>
          ),
        },
      ]}
      unmappedWarehouseCount={unmappedWarehouseCount}
    />
  );
};


