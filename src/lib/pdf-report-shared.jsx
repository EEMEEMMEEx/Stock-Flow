/* eslint-disable react-refresh/only-export-components */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatReportQuantity } from '@/lib/reportPdfData';

export const COMPANY_NAME_TH = 'บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)';
export const COMPANY_NAME_EN = 'FORTH CORPORATION PUBLIC COMPANY LIMITED';
export const COMPANY_ADDRESS =
  '1053/1 ถนนพหลโยธิน แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400 โทรศัพท์: 02-265-6700';
export const FOOTER_BRAND_TEXT =
  'Stock-Flow Inventory & Material Flow OS — Forth Corporation Public Company Limited';

export function formatPrintDateThai(date = new Date()) {
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const sharedReportStyles = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    padding: '8mm 10mm 15mm 10mm',
    fontSize: 10.5,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  // Corporate Header (Page 1)
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0284c7',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    height: 38,
    width: 90,
    objectFit: 'contain',
    marginRight: 8,
  },
  companyDetails: {
    flexDirection: 'column',
  },
  companyNameTh: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.1,
  },
  companyNameEn: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#0284c7',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  companyAddress: {
    fontSize: 7.5,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 1.15,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  docBadge: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  docBadgeText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0369a1',
  },
  printDateText: {
    fontSize: 8,
    color: '#64748b',
  },

  // Compact Header (Continuation / Subsequent Pages)
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#0284c7',
    marginBottom: 5,
  },
  compactTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  compactMeta: {
    fontSize: 8,
    color: '#64748b',
  },

  // Title Banner & Scope Chip
  titleBanner: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: '4 8',
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  filterInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filterChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 4,
    marginVertical: 1,
  },
  filterChipText: {
    fontSize: 8,
    color: '#334155',
  },

  // KPI Summary Cards
  kpiContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    padding: '3 5',
    alignItems: 'center',
    marginRight: 4,
  },
  kpiCardLast: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    padding: '3 5',
    alignItems: 'center',
    marginRight: 0,
  },
  kpiLabel: {
    fontSize: 7.5,
    color: '#64748b',
    fontWeight: 'bold',
    marginBottom: 1,
  },
  kpiValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.1,
  },

  // Section / Warehouse Header Banner + Repeating Table Header
  warehouseHeaderBlock: {
    marginBottom: 0,
  },
  warehouseBanner: {
    backgroundColor: '#0369a1',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warehouseBannerTitle: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  warehouseBannerMeta: {
    fontSize: 8.5,
    color: '#e0f2fe',
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#87daf5',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#5bbfe0',
    minHeight: 20,
    alignItems: 'stretch',
  },
  th: {
    paddingTop: 4,
    paddingBottom: 3,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#67c6e6',
  },
  thText: {
    fontWeight: 'bold',
    fontSize: 9.5,
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: 1.1,
  },
  tableBody: {
    width: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#e2e8f0',
    minHeight: 19,
    alignItems: 'stretch',
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  tableRowOdd: {
    backgroundColor: '#ffffff',
  },
  td: {
    paddingTop: 3.5,
    paddingBottom: 2.5,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 0.75,
    borderRightColor: '#e2e8f0',
  },
  tdText: {
    fontSize: 8.5,
    color: '#1e293b',
    lineHeight: 1.15,
  },
  tdTextBold: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0f172a',
    lineHeight: 1.15,
  },
  tdTextCenter: {
    fontSize: 8.5,
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  tdTextRight: {
    fontSize: 8.5,
    color: '#1e293b',
    textAlign: 'right',
    lineHeight: 1.15,
  },
  stockInText: {
    color: '#059669',
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  stockOutText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  balanceText: {
    color: '#1e40af',
    fontWeight: 'bold',
    fontSize: 9,
  },
  balanceZeroText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 8,
  },
  warningText: {
    color: '#d97706',
    fontWeight: 'bold',
    fontSize: 8.5,
  },

  // Category Sub-header & Empty Row
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: '#bfdbfe',
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 18,
  },
  categoryHeaderText: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#1e3a8a',
  },
  categoryCountText: {
    fontSize: 8,
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  emptyRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.75,
    borderBottomColor: '#e2e8f0',
    minHeight: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  emptyRowText: {
    fontSize: 8.5,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Subtotal Rows
  categorySubtotalRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    minHeight: 18,
    alignItems: 'stretch',
  },
  categorySubtotalLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#334155',
    textAlign: 'right',
    paddingRight: 6,
  },
  warehouseSubtotalRow: {
    flexDirection: 'row',
    backgroundColor: '#e0f2fe',
    borderTopWidth: 1.25,
    borderTopColor: '#0284c7',
    minHeight: 21,
    alignItems: 'stretch',
  },
  warehouseSubtotalLabel: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#0c4a6e',
    textAlign: 'right',
    paddingRight: 6,
  },

  // Grand Total Summary Page
  grandTotalSection: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 3,
    overflow: 'hidden',
  },
  grandTotalHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grandTotalHeaderText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  grandTotalTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 0.75,
    borderBottomColor: '#cbd5e1',
    minHeight: 18,
    alignItems: 'stretch',
  },
  grandTotalRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    minHeight: 17,
    alignItems: 'stretch',
  },
  grandTotalFooterRow: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderTopWidth: 1.5,
    borderTopColor: '#0284c7',
    minHeight: 22,
    alignItems: 'stretch',
  },
  unmappedNote: {
    marginTop: 4,
    fontSize: 8,
    color: '#64748b',
    fontStyle: 'italic',
  },

  // Executive Page Footer
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
    paddingTop: 3,
  },
  footerText: {
    fontSize: 7.5,
    color: '#94a3b8',
  },
});

export const ReportCorporateHeader = ({
  logoSrc = '/images/logo.png',
  badgeText,
  printDateStr,
  reportTitle,
  scopeText,
}) => (
  <View>
    <View style={sharedReportStyles.headerContainer}>
      <View style={sharedReportStyles.headerLeft}>
        {logoSrc ? <Image src={logoSrc} style={sharedReportStyles.logo} /> : null}
        <View style={sharedReportStyles.companyDetails}>
          <Text style={sharedReportStyles.companyNameTh}>{COMPANY_NAME_TH}</Text>
          <Text style={sharedReportStyles.companyNameEn}>{COMPANY_NAME_EN}</Text>
          <Text style={sharedReportStyles.companyAddress}>{COMPANY_ADDRESS}</Text>
        </View>
      </View>

      <View style={sharedReportStyles.headerRight}>
        <View style={sharedReportStyles.docBadge}>
          <Text style={sharedReportStyles.docBadgeText}>{badgeText}</Text>
        </View>
        <Text style={sharedReportStyles.printDateText}>พิมพ์เมื่อ: {printDateStr}</Text>
      </View>
    </View>

    <View style={sharedReportStyles.titleBanner}>
      <Text style={sharedReportStyles.titleText}>{reportTitle}</Text>
      {scopeText ? (
        <View style={sharedReportStyles.filterInfoContainer}>
          <View style={sharedReportStyles.filterChip}>
            <Text style={sharedReportStyles.filterChipText}>{scopeText}</Text>
          </View>
        </View>
      ) : null}
    </View>
  </View>
);

export const ReportCompactHeader = ({ reportTitle, printDateStr }) => (
  <View style={sharedReportStyles.compactHeader} fixed>
    <Text style={sharedReportStyles.compactTitle}>
      {reportTitle} — {COMPANY_NAME_TH}
    </Text>
    <Text style={sharedReportStyles.compactMeta}>พิมพ์เมื่อ: {printDateStr}</Text>
  </View>
);

export const ReportKpiGrid = ({ cards = [] }) => (
  <View style={sharedReportStyles.kpiContainer}>
    {cards.map((card, idx) => {
      const isLast = idx === cards.length - 1;
      return (
        <View
          key={card.key || idx}
          style={isLast ? sharedReportStyles.kpiCardLast : sharedReportStyles.kpiCard}
        >
          <Text style={sharedReportStyles.kpiLabel}>{card.label}</Text>
          <Text
            style={[
              sharedReportStyles.kpiValue,
              card.color ? { color: card.color } : null,
            ]}
          >
            {card.value}
          </Text>
        </View>
      );
    })}
  </View>
);

export const ReportPageFooter = () => (
  <View style={sharedReportStyles.pageFooter} fixed>
    <Text style={sharedReportStyles.footerText}>{FOOTER_BRAND_TEXT}</Text>
    <Text
      style={[sharedReportStyles.footerText, { fontWeight: 'bold' }]}
      render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} จาก ${totalPages}`}
    />
  </View>
);

export const ReportTableHeader = ({ columns = [] }) => (
  <View style={sharedReportStyles.tableHeader}>
    {columns.map((col, idx) => {
      const isLast = idx === columns.length - 1;
      return (
        <View
          key={col.key}
          style={[
            sharedReportStyles.th,
            { width: col.width },
            isLast ? { borderRightWidth: 0 } : null,
          ]}
        >
          <Text style={sharedReportStyles.thText}>{col.label}</Text>
        </View>
      );
    })}
  </View>
);

export const ReportTableRow = ({ columns = [], item, index, isEven }) => (
  <View
    style={[
      sharedReportStyles.tableRow,
      isEven ? sharedReportStyles.tableRowEven : sharedReportStyles.tableRowOdd,
    ]}
    wrap={false}
  >
    {columns.map((col, idx) => {
      const isLast = idx === columns.length - 1;
      return (
        <View
          key={col.key}
          style={[
            sharedReportStyles.td,
            { width: col.width },
            isLast ? { borderRightWidth: 0 } : null,
          ]}
        >
          {col.render(item, index)}
        </View>
      );
    })}
  </View>
);

export const ReportSummaryRow = ({ rowStyle, labelWidth, label, labelStyle, cells = [] }) => (
  <View style={rowStyle} wrap={false}>
    <View
      style={[
        sharedReportStyles.td,
        { width: labelWidth },
        cells.length === 0 ? { borderRightWidth: 0 } : null,
      ]}
    >
      <Text style={labelStyle}>{label}</Text>
    </View>
    {cells.map((cell, idx) => {
      const isLast = idx === cells.length - 1;
      return (
        <View
          key={cell.key || idx}
          style={[
            sharedReportStyles.td,
            { width: cell.width },
            isLast ? { borderRightWidth: 0 } : null,
          ]}
        >
          {cell.content}
        </View>
      );
    })}
  </View>
);

const ReportGrandTotalTable = ({
  title,
  countText,
  columns = [],
  rows = [],
  footerCells = [],
}) => (
  <View style={sharedReportStyles.grandTotalSection} wrap={false}>
    <View style={sharedReportStyles.grandTotalHeader}>
      <Text style={sharedReportStyles.grandTotalHeaderText}>{title}</Text>
      <Text style={sharedReportStyles.warehouseBannerMeta}>{countText}</Text>
    </View>

    <View style={sharedReportStyles.grandTotalTableHeader}>
      {columns.map((col, idx) => {
        const isLast = idx === columns.length - 1;
        return (
          <View
            key={col.key}
            style={[
              sharedReportStyles.th,
              { width: col.width },
              isLast ? { borderRightWidth: 0 } : { borderRightColor: '#cbd5e1' },
            ]}
          >
            <Text style={sharedReportStyles.thText}>{col.label}</Text>
          </View>
        );
      })}
    </View>

    {rows.map((row) => (
      <View key={row.key} style={sharedReportStyles.grandTotalRow}>
        {row.cells.map((cell, idx) => {
          const isLast = idx === row.cells.length - 1;
          return (
            <View
              key={cell.key || idx}
              style={[
                sharedReportStyles.td,
                { width: columns[idx].width },
                isLast ? { borderRightWidth: 0 } : null,
              ]}
            >
              {cell.content}
            </View>
          );
        })}
      </View>
    ))}

    <View style={sharedReportStyles.grandTotalFooterRow}>
      {footerCells.map((cell, idx) => {
        const isLast = idx === footerCells.length - 1;
        return (
          <View
            key={cell.key || idx}
            style={[
              sharedReportStyles.td,
              { width: columns[idx].width },
              isLast ? { borderRightWidth: 0 } : null,
            ]}
          >
            {cell.content}
          </View>
        );
      })}
    </View>
  </View>
);

/**
 * Shared 5-Warehouse × 6-Category PDF Document builder.
 * Used by Report #1 (Goods Receipt), Report #2 (Goods Issue), and Report #3 (Inventory Balance).
 */
export const WarehouseCategoryReportDocument = ({
  logoSrc = '/images/logo.png',
  badgeText,
  reportTitle,
  scopeText = 'ขอบเขต: ทุกคลัง (5 คลัง) / ทุกหมวดหมู่ (6 หมวดหมู่)',
  printDateStr = formatPrintDateThai(),
  kpiCards = [],
  warehouses = [],
  columns = [],
  emptyLabel = 'ไม่มีข้อมูล (No data)',
  subtotalLabelWidth,
  getWarehouseSummaryText,
  getCategoryCountText,
  getCategorySubtotalCells,
  getWarehouseSubtotalCells,
  grandTotalTitle,
  grandTotalCountText,
  grandTotalColumns = [],
  getGrandTotalRows,
  grandTotalFooterCells = [],
  unmappedWarehouseCount = 0,
}) => (
  <Document>
    {warehouses.map((warehouse, wIdx) => {
      const isFirstWarehouse = wIdx === 0;
      const isEmptyWarehouse = warehouse.subtotal.itemCount === 0;

      return (
        <Page key={warehouse.key} size="A4" style={sharedReportStyles.page}>
          {isFirstWarehouse ? (
            <View>
              <ReportCorporateHeader
                logoSrc={logoSrc}
                badgeText={badgeText}
                printDateStr={printDateStr}
                reportTitle={reportTitle}
                scopeText={scopeText}
              />
              <ReportKpiGrid cards={kpiCards} />
            </View>
          ) : (
            <ReportCompactHeader reportTitle={reportTitle} printDateStr={printDateStr} />
          )}

          {/* Repeating Warehouse Header + Table Column Header on every page of this warehouse */}
          <View style={sharedReportStyles.warehouseHeaderBlock} fixed>
            <View style={sharedReportStyles.warehouseBanner}>
              <Text style={sharedReportStyles.warehouseBannerTitle}>
                คลังที่ {warehouse.order}/{warehouses.length}: {warehouse.label}
              </Text>
              <Text style={sharedReportStyles.warehouseBannerMeta}>
                {isEmptyWarehouse ? emptyLabel : getWarehouseSummaryText(warehouse)}
              </Text>
            </View>

            <ReportTableHeader columns={columns} />
          </View>

          {/* All 6 Categories in Canonical Order */}
          <View style={sharedReportStyles.tableBody}>
            {warehouse.categories.map((category) => (
              <View key={category.key} wrap={category.items.length > 0}>
                <View
                  style={sharedReportStyles.categoryHeaderRow}
                  wrap={false}
                  minPresenceAhead={40}
                >
                  <Text style={sharedReportStyles.categoryHeaderText}>
                    {warehouse.order}.{category.order} หมวดหมู่: {category.label}
                  </Text>
                  <Text style={sharedReportStyles.categoryCountText}>
                    {category.items.length === 0
                      ? emptyLabel
                      : getCategoryCountText
                        ? getCategoryCountText(category)
                        : `${formatReportQuantity(category.subtotal.itemCount)} รายการ`}
                  </Text>
                </View>

                {category.items.length === 0 ? (
                  <View style={sharedReportStyles.emptyRow} wrap={false}>
                    <Text style={sharedReportStyles.emptyRowText}>{emptyLabel}</Text>
                  </View>
                ) : (
                  category.items.map((item, itemIdx) => (
                    <ReportTableRow
                      key={`${category.key}-${item.itemId || item.id || itemIdx}-${itemIdx}`}
                      columns={columns}
                      item={item}
                      index={itemIdx}
                      isEven={itemIdx % 2 === 1}
                    />
                  ))
                )}

                <ReportSummaryRow
                  rowStyle={sharedReportStyles.categorySubtotalRow}
                  labelWidth={subtotalLabelWidth}
                  label={`รวมหมวดหมู่ ${category.label} (${formatReportQuantity(category.subtotal.itemCount)} รายการ)`}
                  labelStyle={sharedReportStyles.categorySubtotalLabel}
                  cells={getCategorySubtotalCells(category)}
                />
              </View>
            ))}

            <ReportSummaryRow
              rowStyle={sharedReportStyles.warehouseSubtotalRow}
              labelWidth={subtotalLabelWidth}
              label={`รวมยอดคลัง ${warehouse.label} (${formatReportQuantity(warehouse.subtotal.itemCount)} รายการ)`}
              labelStyle={sharedReportStyles.warehouseSubtotalLabel}
              cells={getWarehouseSubtotalCells(warehouse)}
            />
          </View>

          <ReportPageFooter />
        </Page>
      );
    })}

    {/* Dedicated Grand Total Summary Page (never polluted by Warehouse 5 fixed headers) */}
    <Page key="grand-total" size="A4" style={sharedReportStyles.page}>
      <ReportCompactHeader reportTitle={reportTitle} printDateStr={printDateStr} />

      <ReportGrandTotalTable
        title={grandTotalTitle}
        countText={grandTotalCountText}
        columns={grandTotalColumns}
        rows={getGrandTotalRows(warehouses)}
        footerCells={grandTotalFooterCells}
      />

      {unmappedWarehouseCount > 0 ? (
        <Text style={sharedReportStyles.unmappedNote}>
          หมายเหตุ: พบรายการที่ไม่ตรงกับคลังมาตรฐาน 5 คลัง จำนวน{' '}
          {formatReportQuantity(unmappedWarehouseCount)} รายการ (แยกติดตามต่างหาก ไม่ได้แสดงเป็นคลังที่ 6)
        </Text>
      ) : null}

      <ReportPageFooter />
    </Page>
  </Document>
);

/**
 * Shared Category-Grouped PDF Document builder for reports without a per-warehouse
 * dimension (Report #4: BOM Spec & Site Kits Readiness Report).
 * Preserves the exact same visual language, repeating headers, 6 canonical categories,
 * subtotals, and dedicated Grand Total Summary page.
 */
export const CategoryGroupedReportDocument = ({
  logoSrc = '/images/logo.png',
  badgeText,
  reportTitle,
  scopeText,
  sectionBannerTitle,
  sectionBannerMeta,
  printDateStr = formatPrintDateThai(),
  kpiCards = [],
  categories = [],
  columns = [],
  emptyLabel = 'ไม่มีข้อมูล (No data)',
  subtotalLabelWidth,
  getCategoryCountText,
  getCategorySubtotalCells,
  grandTotalTitle,
  grandTotalCountText,
  grandTotalColumns = [],
  getGrandTotalRows,
  grandTotalFooterCells = [],
  footerNote = '',
}) => (
  <Document>
    <Page key="categories-detail" size="A4" style={sharedReportStyles.page}>
      <View>
        <ReportCorporateHeader
          logoSrc={logoSrc}
          badgeText={badgeText}
          printDateStr={printDateStr}
          reportTitle={reportTitle}
          scopeText={scopeText}
        />
        <ReportKpiGrid cards={kpiCards} />
      </View>

      {/* Repeating Section Banner + Table Column Header on every continuation page */}
      <View style={sharedReportStyles.warehouseHeaderBlock} fixed>
        <View style={sharedReportStyles.warehouseBanner}>
          <Text style={sharedReportStyles.warehouseBannerTitle}>{sectionBannerTitle}</Text>
          <Text style={sharedReportStyles.warehouseBannerMeta}>{sectionBannerMeta}</Text>
        </View>

        <ReportTableHeader columns={columns} />
      </View>

      {/* All 6 Canonical Categories in Fixed Order */}
      <View style={sharedReportStyles.tableBody}>
        {categories.map((category) => (
          <View key={category.key} wrap={category.items.length > 0}>
            <View
              style={sharedReportStyles.categoryHeaderRow}
              wrap={false}
              minPresenceAhead={40}
            >
              <Text style={sharedReportStyles.categoryHeaderText}>
                หมวดที่ {category.order}/{categories.length}: {category.label}
              </Text>
              <Text style={sharedReportStyles.categoryCountText}>
                {category.items.length === 0
                  ? emptyLabel
                  : getCategoryCountText
                    ? getCategoryCountText(category)
                    : `${formatReportQuantity(category.subtotal.itemCount)} รายการ`}
              </Text>
            </View>

            {category.items.length === 0 ? (
              <View style={sharedReportStyles.emptyRow} wrap={false}>
                <Text style={sharedReportStyles.emptyRowText}>{emptyLabel}</Text>
              </View>
            ) : (
              category.items.map((item, itemIdx) => (
                <ReportTableRow
                  key={`${category.key}-${item.id || itemIdx}-${itemIdx}`}
                  columns={columns}
                  item={item}
                  index={itemIdx}
                  isEven={itemIdx % 2 === 1}
                />
              ))
            )}

            <ReportSummaryRow
              rowStyle={sharedReportStyles.categorySubtotalRow}
              labelWidth={subtotalLabelWidth}
              label={`รวมหมวดหมู่ ${category.label} (${formatReportQuantity(category.subtotal.itemCount)} รายการ)`}
              labelStyle={sharedReportStyles.categorySubtotalLabel}
              cells={getCategorySubtotalCells(category)}
            />
          </View>
        ))}
      </View>

      <ReportPageFooter />
    </Page>

    {/* Dedicated Grand Total Summary Page */}
    <Page key="grand-total" size="A4" style={sharedReportStyles.page}>
      <ReportCompactHeader reportTitle={reportTitle} printDateStr={printDateStr} />

      <ReportGrandTotalTable
        title={grandTotalTitle}
        countText={grandTotalCountText}
        columns={grandTotalColumns}
        rows={getGrandTotalRows(categories)}
        footerCells={grandTotalFooterCells}
      />

      {footerNote ? <Text style={sharedReportStyles.unmappedNote}>{footerNote}</Text> : null}

      <ReportPageFooter />
    </Page>
  </Document>
);
