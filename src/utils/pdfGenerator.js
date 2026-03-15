import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import logo from '../assets/logo.png';

export const generatePDF = async (transaction, approverName, cartItems = []) => {
    const doc = new jsPDF();

    // Add Thai Font - TH Sarabun New
    try {
        // Load Regular font
        const responseRegular = await fetch('/fonts/THSarabunNew-Regular.ttf.base64');
        const fontBase64Regular = await responseRegular.text();
        const cleanFontBase64Regular = fontBase64Regular.replace(/\s/g, '');

        // Load Bold font
        const responseBold = await fetch('/fonts/THSarabunNew-Bold.ttf.base64');
        const fontBase64Bold = await responseBold.text();
        const cleanFontBase64Bold = fontBase64Bold.replace(/\s/g, '');

        doc.addFileToVFS("THSarabunNew-Regular.ttf", cleanFontBase64Regular);
        doc.addFileToVFS("THSarabunNew-Bold.ttf", cleanFontBase64Bold);
        doc.addFont("THSarabunNew-Regular.ttf", "THSarabunNew", "normal");
        doc.addFont("THSarabunNew-Bold.ttf", "THSarabunNew", "bold");
        doc.setFont("THSarabunNew");
    } catch (error) {
        console.error("Error loading font:", error);
        // Fallback to default font if loading fails
    }

    // --- Header ---
    // Logo
    doc.addImage(logo, 'PNG', 15, 10, 40, 16);

    // Company Details (Right Aligned)
    doc.setFontSize(10);
    doc.text("Forth Corporation Public Co., Ltd.", 195, 15, { align: "right" });
    doc.setFontSize(9);
    doc.text("1053/1 Phaholyothin Road, Phayathai, Bangkok 10400", 195, 20, { align: "right" });
    doc.text("Tel: 02-265-6700 | Tax ID: 0107548000471", 195, 25, { align: "right" });

    // --- Title ---
    doc.setDrawColor(13, 51, 166); // #0D33A6
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    doc.setFontSize(18);
    doc.setTextColor(13, 51, 166); // #0D33A6
    doc.text("ใบเบิกอุปกรณ์", 105, 43, { align: "center" });

    doc.line(15, 46, 195, 46);

    // --- Info Section ---
    doc.setTextColor(0, 0, 0); // Reset color to black
    doc.setFontSize(10);

    const formattedDate = transaction?.created_at ? new Date(transaction.created_at) : new Date();
    const slipDate = format(formattedDate, 'yyyyMMdd');
    const slipTime = format(formattedDate, 'HHmmss');
    const slipNumber = `${slipDate}DO${slipTime}PA`;
    const dateStr = format(formattedDate, 'dd/MM/yyyy HH:mm');

    // Handle delivery location and note from transaction metadata if available, or pass as args
    // For reprint, we might need to store these in the transaction record.
    // Assuming transaction object has these fields or we pass them.
    // For now, let's assume transaction object might have them or we use defaults.
    // Since the original code used local state 'deliveryLocation' and 'note',
    // we need to ensure these are passed or available.
    // For the Cart flow, we can pass them. For reprint, we need to see if they are saved.
    // Looking at Cart.jsx, they are NOT saved to the transaction table directly in the previous code!
    // Wait, let's check Cart.jsx again.
    // Cart.jsx inserts: type, requester_name, approver_name.
    // It does NOT insert delivery_location or note.
    // This means reprint won't have delivery location or note unless we add columns or use what we have.
    // The user said "Do not modify PDF structure".
    // If the data isn't in DB, we can't reprint it exactly as it was if it contained that data.
    // However, the user just asked for "Reprint".
    // I will use empty strings or placeholders if data is missing, but I should probably check if I can save them.
    // But the user said "Do not modify PDF structure".
    // Actually, I can pass them as arguments.
    // For now, I will use the transaction object properties if they exist.

    const deliveryLocation = transaction.delivery_location || '-';
    const note = transaction.note || '-';
    const requesterName = transaction.requester_name || '-';

    const deliveryLocationText = `สถานที่ส่งของ: ${deliveryLocation}`;
    const splitDeliveryLocation = doc.splitTextToSize(deliveryLocationText, 90);
    doc.text(splitDeliveryLocation, 15, 55);
    doc.text(`เลขที่ใบเบิก: ${slipNumber}`, 195, 55, { align: "right" });

    doc.text(`วันที่: ${dateStr}`, 195, 62, { align: "right" });

    // --- Table ---
    const tableColumn = ["#", "รายการ / Description", "จำนวน / Qty", "หมายเหตุ / Remark"];
    const tableRows = [];

    // Use passed cartItems or transaction.transaction_items
    const items = cartItems.length > 0 ? cartItems : (transaction.transaction_items || []);

    items.forEach((item, index) => {
        // Handle different structure between cart item and transaction item
        let itemName = item.name || item.products?.name || 'Unknown Item';
        const itemQuantity = item.cartQuantity || item.quantity || 0;

        // Append Serial Numbers if available
        if (item.serialNumbers && item.serialNumbers.length > 0) {
            itemName += `\n(S/N: ${item.serialNumbers.join(', ')})`;
        }

        const itemData = [
            index + 1,
            itemName,
            itemQuantity,
            ""
        ];
        tableRows.push(itemData);
    });

    // Calculate total items
    const totalItems = items.reduce((acc, item) => acc + (item.cartQuantity || item.quantity || 0), 0);

    // Add Total Row
    tableRows.push([
        { content: "รวมทั้งสิ้น", colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalItems, styles: { halign: 'center', fontStyle: 'bold' } },
        ""
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 70,
        theme: 'grid',
        styles: {
            font: "THSarabunNew", // Global font for table
            fontSize: 9,
            cellPadding: 2,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            font: "THSarabunNew" // Explicitly set font for header
        },
        bodyStyles: {
            font: "THSarabunNew" // Explicitly set font for body
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { cellWidth: 100 },
            2: { halign: 'center', cellWidth: 25 },
            3: { cellWidth: 40 }
        },
        didParseCell: function (data) {
            // Ensure font is applied to every cell
            data.cell.styles.font = "THSarabunNew";
        }
    });

    // --- Note below table ---
    let currentY = doc.lastAutoTable.finalY + 10;
    const noteText = `หมายเหตุ (Note): ${note}`;
    const splitNote = doc.splitTextToSize(noteText, 180);
    doc.text(splitNote, 15, currentY);

    // --- Footer (Signatures) ---
    // Calculate Y position based on table end, but ensure it's at bottom if possible
    let finalY = currentY + 20;
    const pageHeight = doc.internal.pageSize.height;

    // If content is short, push footer to bottom
    if (finalY < pageHeight - 60) {
        finalY = pageHeight - 60;
    }

    // Signatures
    doc.setLineWidth(0.1);
    doc.setDrawColor(150, 150, 150); // Gray dotted line color

    // Requester Signature
    doc.setLineDash([1, 1], 0);
    doc.line(35, finalY, 85, finalY); // Signature line
    doc.text(`( ${requesterName} )`, 60, finalY + 5, { align: "center" });
    doc.text("ผู้เบิก", 60, finalY + 12, { align: "center" });

    // Approver Signature
    doc.line(125, finalY, 175, finalY); // Signature line
    doc.text(`( ${approverName} )`, 150, finalY + 5, { align: "center" });
    doc.text("ผู้ส่งของ", 150, finalY + 12, { align: "center" });

    // Footer Text
    doc.setLineDash([], 0); // Reset dash
    doc.setDrawColor(200, 200, 200);
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`เอกสารนี้สร้างโดยระบบ Stock-Flow Inventory System | พิมพ์เมื่อ: ${dateStr}`, 105, pageHeight - 10, { align: "center" });

    doc.save(`receipt-${slipNumber}.pdf`);
};

// Generate Assets Report PDF
export const generateAssetsReportPDF = async (assets, filterStatus = 'all') => {
    const doc = new jsPDF();

    // Add Thai Font - TH Sarabun New
    try {
        const responseRegular = await fetch('/fonts/THSarabunNew-Regular.ttf.base64');
        const fontBase64Regular = await responseRegular.text();
        const cleanFontBase64Regular = fontBase64Regular.replace(/\s/g, '');

        const responseBold = await fetch('/fonts/THSarabunNew-Bold.ttf.base64');
        const fontBase64Bold = await responseBold.text();
        const cleanFontBase64Bold = fontBase64Bold.replace(/\s/g, '');

        doc.addFileToVFS("THSarabunNew-Regular.ttf", cleanFontBase64Regular);
        doc.addFileToVFS("THSarabunNew-Bold.ttf", cleanFontBase64Bold);
        doc.addFont("THSarabunNew-Regular.ttf", "THSarabunNew", "normal");
        doc.addFont("THSarabunNew-Bold.ttf", "THSarabunNew", "bold");
        doc.setFont("THSarabunNew");
    } catch (error) {
        console.error("Error loading font:", error);
    }

    const now = new Date();
    const dateStr = format(now, 'dd/MM/yyyy HH:mm');
    const reportNumber = format(now, 'yyyyMMdd-HHmmss');

    // --- Header ---
    doc.addImage(logo, 'PNG', 15, 10, 40, 16);

    doc.setFontSize(10);
    doc.text("Forth Corporation Public Co., Ltd.", 195, 15, { align: "right" });
    doc.setFontSize(9);
    doc.text("1053/1 Phaholyothin Road, Phayathai, Bangkok 10400", 195, 20, { align: "right" });
    doc.text("Tel: 02-265-6700 | Tax ID: 0107548000471", 195, 25, { align: "right" });

    // --- Title ---
    doc.setDrawColor(13, 51, 166);
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    doc.setFontSize(18);
    doc.setTextColor(13, 51, 166);
    doc.text("รายงานครุภัณฑ์", 105, 43, { align: "center" });

    doc.line(15, 46, 195, 46);

    // --- Info Section ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    const statusLabel = filterStatus === 'all' ? 'ทั้งหมด' : filterStatus === 'in_stock' ? 'พร้อมใช้งาน' : 'ถูกเบิกไป';
    doc.text(`สถานะ: ${statusLabel}`, 15, 55);
    doc.text(`เลขที่รายงาน: RPT-${reportNumber}`, 195, 55, { align: "right" });
    doc.text(`วันที่พิมพ์: ${dateStr}`, 195, 62, { align: "right" });
    doc.text(`จำนวนรายการ: ${assets.length} รายการ`, 15, 62);

    // --- Table ---
    const tableColumn = ["#", "เลขครุภัณฑ์", "ชื่ออุปกรณ์", "รหัส SKU", "สถานะ", "ผู้ถือครอง"];
    const tableRows = [];

    assets.forEach((asset, index) => {
        const status = asset.status === 'in_stock' ? 'พร้อมใช้งาน' : 'ถูกเบิกไป';
        const itemData = [
            index + 1,
            asset.serial_number || '-',
            asset.products?.name || '-',
            asset.products?.sku || '-',
            status,
            asset.current_holder || '-'
        ];
        tableRows.push(itemData);
    });

    // Summary row
    const inStockCount = assets.filter(a => a.status === 'in_stock').length;
    const inUseCount = assets.filter(a => a.status !== 'in_stock').length;

    tableRows.push([
        { content: "สรุป", colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `พร้อมใช้: ${inStockCount}`, styles: { fontStyle: 'bold' } },
        { content: `ถูกเบิก: ${inUseCount}`, styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 70,
        theme: 'grid',
        styles: {
            font: "THSarabunNew",
            fontSize: 9,
            cellPadding: 2,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [28, 108, 180],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            font: "THSarabunNew"
        },
        bodyStyles: {
            font: "THSarabunNew"
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 35 },
            2: { cellWidth: 50 },
            3: { cellWidth: 25 },
            4: { halign: 'center', cellWidth: 25 },
            5: { cellWidth: 35 }
        },
        didParseCell: function (data) {
            data.cell.styles.font = "THSarabunNew";
            // Color code status
            if (data.column.index === 4 && data.section === 'body' && data.row.index < assets.length) {
                if (data.cell.raw === 'พร้อมใช้งาน') {
                    data.cell.styles.textColor = [34, 197, 94]; // Green
                } else if (data.cell.raw === 'ถูกเบิกไป') {
                    data.cell.styles.textColor = [239, 68, 68]; // Red
                }
            }
        }
    });

    // --- Footer ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`เอกสารนี้สร้างโดยระบบ Stock-Flow Inventory System | พิมพ์เมื่อ: ${dateStr}`, 105, pageHeight - 10, { align: "center" });

    doc.save(`assets-report-${reportNumber}.pdf`);
};

// Generate Assets Import Report PDF - specifically for imported assets
export const generateAssetsImportReportPDF = async (importedAssets, successCount, errorCount, errors = []) => {
    const doc = new jsPDF();

    // Add Thai Font - TH Sarabun New
    try {
        const responseRegular = await fetch('/fonts/THSarabunNew-Regular.ttf.base64');
        const fontBase64Regular = await responseRegular.text();
        const cleanFontBase64Regular = fontBase64Regular.replace(/\s/g, '');

        const responseBold = await fetch('/fonts/THSarabunNew-Bold.ttf.base64');
        const fontBase64Bold = await responseBold.text();
        const cleanFontBase64Bold = fontBase64Bold.replace(/\s/g, '');

        doc.addFileToVFS("THSarabunNew-Regular.ttf", cleanFontBase64Regular);
        doc.addFileToVFS("THSarabunNew-Bold.ttf", cleanFontBase64Bold);
        doc.addFont("THSarabunNew-Regular.ttf", "THSarabunNew", "normal");
        doc.addFont("THSarabunNew-Bold.ttf", "THSarabunNew", "bold");
        doc.setFont("THSarabunNew");
    } catch (error) {
        console.error("Error loading font:", error);
    }

    const now = new Date();
    const dateStr = format(now, 'dd/MM/yyyy HH:mm');
    const reportNumber = format(now, 'yyyyMMdd-HHmmss');

    // --- Header ---
    doc.addImage(logo, 'PNG', 15, 10, 40, 16);

    doc.setFontSize(10);
    doc.text("Forth Corporation Public Co., Ltd.", 195, 15, { align: "right" });
    doc.setFontSize(9);
    doc.text("1053/1 Phaholyothin Road, Phayathai, Bangkok 10400", 195, 20, { align: "right" });
    doc.text("Tel: 02-265-6700 | Tax ID: 0107548000471", 195, 25, { align: "right" });

    // --- Title ---
    doc.setDrawColor(34, 197, 94); // Green for import
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94);
    doc.text("รายงานการนำเข้าครุภัณฑ์", 105, 43, { align: "center" });

    doc.line(15, 46, 195, 46);

    // --- Summary Section ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    doc.text(`เลขที่รายงาน: IMP-${reportNumber}`, 195, 55, { align: "right" });
    doc.text(`วันที่นำเข้า: ${dateStr}`, 195, 62, { align: "right" });

    // Import Summary Box
    doc.setFillColor(240, 253, 244); // Light green background
    doc.roundedRect(15, 52, 90, 20, 3, 3, 'F');
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(12);
    doc.text(`นำเข้าสำเร็จ: ${successCount} รายการ`, 20, 60);
    doc.setTextColor(239, 68, 68);
    doc.text(`ล้มเหลว: ${errorCount} รายการ`, 20, 68);

    // --- Table ---
    doc.setTextColor(0, 0, 0);
    const tableColumn = ["#", "เลขครุภัณฑ์", "ชื่ออุปกรณ์", "รหัส SKU", "สถานะ"];
    const tableRows = [];

    importedAssets.forEach((asset, index) => {
        const itemData = [
            index + 1,
            asset.serial_number || '-',
            asset.products?.name || asset.productName || '-',
            asset.products?.sku || '-',
            'นำเข้าสำเร็จ'
        ];
        tableRows.push(itemData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 78,
        theme: 'grid',
        styles: {
            font: "THSarabunNew",
            fontSize: 9,
            cellPadding: 2,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [34, 197, 94], // Green header
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            font: "THSarabunNew"
        },
        bodyStyles: {
            font: "THSarabunNew"
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            1: { cellWidth: 40 },
            2: { cellWidth: 70 },
            3: { cellWidth: 30 },
            4: { halign: 'center', cellWidth: 28 }
        },
        didParseCell: function (data) {
            data.cell.styles.font = "THSarabunNew";
            if (data.column.index === 4 && data.section === 'body') {
                data.cell.styles.textColor = [34, 197, 94]; // Green for success
            }
        }
    });

    // --- Errors Section (if any) ---
    if (errors.length > 0) {
        let currentY = doc.lastAutoTable.finalY + 10;

        doc.setFontSize(11);
        doc.setTextColor(239, 68, 68);
        doc.text("รายการที่ล้มเหลว:", 15, currentY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const errorList = errors.slice(0, 10).map((err, i) => `${i + 1}. ${err}`);
        errorList.forEach((err) => {
            currentY += 5;
            const splitErr = doc.splitTextToSize(err, 180);
            doc.text(splitErr, 15, currentY);
            currentY += (splitErr.length - 1) * 4;
        });

        if (errors.length > 10) {
            currentY += 5;
            doc.text(`... และอีก ${errors.length - 10} รายการ`, 15, currentY);
        }
    }

    // --- Footer ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`เอกสารนี้สร้างโดยระบบ Stock-Flow Inventory System | พิมพ์เมื่อ: ${dateStr}`, 105, pageHeight - 10, { align: "center" });

    doc.save(`assets-import-report-${reportNumber}.pdf`);
};

// Generate Products Import Report PDF
export const generateProductsImportReportPDF = async (importedProducts, successCount, errorCount, errors = []) => {
    const doc = new jsPDF();

    // Add Thai Font - TH Sarabun New
    try {
        const responseRegular = await fetch('/fonts/THSarabunNew-Regular.ttf.base64');
        const fontBase64Regular = await responseRegular.text();
        const cleanFontBase64Regular = fontBase64Regular.replace(/\s/g, '');

        const responseBold = await fetch('/fonts/THSarabunNew-Bold.ttf.base64');
        const fontBase64Bold = await responseBold.text();
        const cleanFontBase64Bold = fontBase64Bold.replace(/\s/g, '');

        doc.addFileToVFS("THSarabunNew-Regular.ttf", cleanFontBase64Regular);
        doc.addFileToVFS("THSarabunNew-Bold.ttf", cleanFontBase64Bold);
        doc.addFont("THSarabunNew-Regular.ttf", "THSarabunNew", "normal");
        doc.addFont("THSarabunNew-Bold.ttf", "THSarabunNew", "bold");
        doc.setFont("THSarabunNew");
    } catch (error) {
        console.error("Error loading font:", error);
    }

    const now = new Date();
    const dateStr = format(now, 'dd/MM/yyyy HH:mm');
    const reportNumber = format(now, 'yyyyMMdd-HHmmss');

    // --- Header ---
    doc.addImage(logo, 'PNG', 15, 10, 40, 16);

    doc.setFontSize(10);
    doc.text("Forth Corporation Public Co., Ltd.", 195, 15, { align: "right" });
    doc.setFontSize(9);
    doc.text("1053/1 Phaholyothin Road, Phayathai, Bangkok 10400", 195, 20, { align: "right" });
    doc.text("Tel: 02-265-6700 | Tax ID: 0107548000471", 195, 25, { align: "right" });

    // --- Title ---
    doc.setDrawColor(34, 197, 94); // Green for import
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94);
    doc.text("รายงานการนำเข้าอุปกรณ์", 105, 43, { align: "center" });

    doc.line(15, 46, 195, 46);

    // --- Summary Section ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    doc.text(`เลขที่รายงาน: IMP-PROD-${reportNumber}`, 195, 55, { align: "right" });
    doc.text(`วันที่นำเข้า: ${dateStr}`, 195, 62, { align: "right" });

    // Import Summary Box
    doc.setFillColor(240, 253, 244); // Light green background
    doc.roundedRect(15, 52, 90, 20, 3, 3, 'F');
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(12);
    doc.text(`นำเข้าสำเร็จ: ${successCount} รายการ`, 20, 60);
    doc.setTextColor(239, 68, 68);
    doc.text(`ล้มเหลว: ${errorCount} รายการ`, 20, 68);

    // --- Table ---
    doc.setTextColor(0, 0, 0);
    const tableColumn = ["#", "รหัส SKU", "ชื่ออุปกรณ์", "หมวดหมู่", "จำนวน", "สถานะ"];
    const tableRows = [];

    importedProducts.forEach((product, index) => {
        const itemData = [
            index + 1,
            product.sku || '-',
            product.name || '-',
            product.category || '-',
            product.quantity || '0',
            'นำเข้าสำเร็จ'
        ];
        tableRows.push(itemData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 78,
        theme: 'grid',
        styles: {
            font: "THSarabunNew",
            fontSize: 9,
            cellPadding: 2,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [34, 197, 94], // Green header
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            font: "THSarabunNew"
        },
        bodyStyles: {
            font: "THSarabunNew"
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 30 },
            2: { cellWidth: 60 },
            3: { cellWidth: 30 },
            4: { halign: 'center', cellWidth: 20 },
            5: { halign: 'center', cellWidth: 25 }
        },
        didParseCell: function (data) {
            data.cell.styles.font = "THSarabunNew";
            if (data.column.index === 5 && data.section === 'body') {
                data.cell.styles.textColor = [34, 197, 94]; // Green for success
            }
        }
    });

    // --- Errors Section (if any) ---
    if (errors.length > 0) {
        let currentY = doc.lastAutoTable.finalY + 10;

        doc.setFontSize(11);
        doc.setTextColor(239, 68, 68);
        doc.text("รายการที่ล้มเหลว:", 15, currentY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const errorList = errors.slice(0, 10).map((err, i) => `${i + 1}. ${err}`);
        errorList.forEach((err) => {
            currentY += 5;
            const splitErr = doc.splitTextToSize(err, 180);
            doc.text(splitErr, 15, currentY);
            currentY += (splitErr.length - 1) * 4;
        });

        if (errors.length > 10) {
            currentY += 5;
            doc.text(`... และอีก ${errors.length - 10} รายการ`, 15, currentY);
        }
    }

    // --- Footer ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`เอกสารนี้สร้างโดยระบบ Stock-Flow Inventory System | พิมพ์เมื่อ: ${dateStr}`, 105, pageHeight - 10, { align: "center" });

    doc.save(`products-import-report-${reportNumber}.pdf`);
};

