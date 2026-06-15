import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as fs from 'fs';

export interface CreditOutstandingRow {
  sNo: number;
  billedDate: string;
  billNumber: string;
  mrn: string;
  visitType: string;
  patientName: string;
  doctorName: string;
  scheme: string;
  companyName: string;
  grossAmount: number;
  totalAmount: number;
  roundedAmount: number;
  paymentMode: string;
  billPaymentStatus: string;
  type: string;
}

export interface CreditOutstandingExportOpts {
  rows: CreditOutstandingRow[];
  summary: {
    billsScanned: number;
    pharmacyBills: number;
    creditModeBills: number;
    totalGrossOutstanding: number;
    totalRoundedOutstanding: number;
  };
  tenant: string;
  fromDate: string;
  toDate: string;
  outputPath: string;
}

const PAGE_W = 841.89; // A4 Landscape
const PAGE_H = 595.28;
const MARGIN = 34.02; // 12mm in points
const CONTENT_WIDTH = PAGE_W - MARGIN * 2;

// Sum of weights must equal 1.00
const COL_WEIGHTS = [
  0.03, // SNo.
  0.08, // Billed Date
  0.07, // Bill Number
  0.06, // MRN
  0.05, // Visit Type
  0.11, // Patient Name
  0.11, // Doctor Name
  0.06, // Scheme
  0.11, // Company Name
  0.06, // Gross Amount
  0.06, // Total Amount
  0.07, // Rounded Amount
  0.05, // Payment Mode
  0.05, // Bill Payment Status
  0.03, // Type
];

const colWidths = COL_WEIGHTS.map(w => w * CONTENT_WIDTH);

function drawPageBorder(doc: PDFKit.PDFDocument) {
  doc
    .strokeColor('#0F2D52')
    .lineWidth(1.5)
    .rect(MARGIN - 10, MARGIN - 10, PAGE_W - (MARGIN - 10) * 2, PAGE_H - (MARGIN - 10) * 2)
    .stroke();
}

function drawPageFooter(doc: PDFKit.PDFDocument, pageNo: number, totalPages: number) {
  const footerY = PAGE_H - MARGIN + 10;
  
  // Separator Line
  doc
    .strokeColor('#6B7280')
    .lineWidth(0.5)
    .moveTo(MARGIN, footerY)
    .lineTo(MARGIN + CONTENT_WIDTH, footerY)
    .stroke();

  doc.font('Helvetica').fontSize(7).fillColor('#6B7280');
  
  // Left: Timestamp (IST)
  const printTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  doc.text(`Generated ${printTime} IST`, MARGIN, footerY + 5);
  
  // Right: Page X of Y
  doc.text(`Page ${pageNo} of ${totalPages}`, MARGIN, footerY + 5, { align: 'right', width: CONTENT_WIDTH });
  
  // Center: App / Report Name
  doc.text('eCare360 MIS  •  Pharmacy Credit Outstanding', MARGIN, footerY + 5, { align: 'center', width: CONTENT_WIDTH });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const ROW_H = 22;
  doc.fillColor('#0F2D52').rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');

  const headers = [
    "SNo.", "Billed Date", "Bill Number", "MRN", "Visit Type", "Patient Name",
    "Doctor Name", "Scheme", "Company Name",
    "Gross Amount", "Total Amount", "Rounded Amount",
    "Payment Mode", "Bill Status", "Type"
  ];

  let currentX = MARGIN;
  headers.forEach((header, idx) => {
    const w = colWidths[idx];
    const isCenter = [0, 9, 10, 11, 14].includes(idx);
    doc.text(header, currentX + 3, y + 6, {
      width: w - 6,
      align: isCenter ? 'center' : 'left',
      lineBreak: false,
    });
    currentX += w;
  });

  return y + ROW_H;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  row: CreditOutstandingRow,
  y: number,
  isAlt: boolean
): number {
  const isReturn = row.type === 'Return';
  
  const cells = [
    String(row.sNo),
    row.billedDate,
    row.billNumber,
    row.mrn,
    row.visitType,
    row.patientName,
    row.doctorName,
    row.scheme,
    row.companyName,
    row.grossAmount.toFixed(2),
    row.totalAmount.toFixed(2),
    row.roundedAmount.toFixed(2),
    row.paymentMode,
    row.billPaymentStatus,
    row.type
  ];

  // 1. Calculate row height dynamically
  doc.font('Helvetica').fontSize(7.5);
  let maxH = 0;
  cells.forEach((val, idx) => {
    const w = colWidths[idx];
    const h = doc.heightOfString(val, { width: w - 6 });
    if (h > maxH) maxH = h;
  });
  const ROW_H = Math.max(16, maxH + 6);

  // 2. Row background
  let fillBg = '#FFFFFF';
  if (isReturn) {
    fillBg = '#FFE5E5'; // Light Red for returns
  } else if (isAlt) {
    fillBg = '#F0F4F8'; // Alternating grey
  }
  doc.fillColor(fillBg).rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();

  // 3. Bottom border
  doc.strokeColor('#D0D8E4').lineWidth(0.5).moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H).stroke();

  // 4. Vertical borders
  let currentX = MARGIN;
  colWidths.forEach((w) => {
    doc.strokeColor('#D0D8E4').lineWidth(0.3).moveTo(currentX, y).lineTo(currentX, y + ROW_H).stroke();
    currentX += w;
  });
  // Rightmost border
  doc.strokeColor('#D0D8E4').lineWidth(0.3).moveTo(MARGIN + CONTENT_WIDTH, y).lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H).stroke();

  // 5. Render Text
  currentX = MARGIN;
  cells.forEach((val, idx) => {
    const w = colWidths[idx];
    const isCenter = [0, 14].includes(idx);
    const isRight = [9, 10, 11].includes(idx);
    
    let fontName = 'Helvetica';
    let color = '#1A1A2E';
    if (isReturn) {
      color = '#B91C1C';
      if (isRight) {
        fontName = 'Helvetica-Bold';
      }
    }
    
    doc.font(fontName).fontSize(7.5).fillColor(color);
    doc.text(val, currentX + 3, y + 4, {
      width: w - 6,
      align: isCenter ? 'center' : (isRight ? 'right' : 'left'),
    });
    currentX += w;
  });

  return y + ROW_H;
}

function drawTotalRow(
  doc: PDFKit.PDFDocument,
  summary: CreditOutstandingExportOpts['summary'],
  totalAmountSum: number,
  y: number
): number {
  const ROW_H = 20;
  
  // Background
  doc.fillColor('#FFF1C2').rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();

  // Bottom border
  doc.strokeColor('#0F2D52').lineWidth(1.2).moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H).stroke();

  // Vertical borders
  let currentX = MARGIN;
  colWidths.forEach((w) => {
    doc.strokeColor('#D0D8E4').lineWidth(0.3).moveTo(currentX, y).lineTo(currentX, y + ROW_H).stroke();
    currentX += w;
  });
  doc.strokeColor('#D0D8E4').lineWidth(0.3).moveTo(MARGIN + CONTENT_WIDTH, y).lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H).stroke();

  // Render "TOTAL" label spanning cols 1-9
  const labelWidth = colWidths.slice(0, 9).reduce((sum, w) => sum + w, 0);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0F2D52');
  doc.text('TOTAL', MARGIN + 3, y + 6, {
    width: labelWidth - 6,
    align: 'right'
  });

  // Render Gross, Total, Rounded amounts
  const startXGross = MARGIN + labelWidth;
  const wGross = colWidths[9];
  const wTotal = colWidths[10];
  const wRounded = colWidths[11];

  doc.text(summary.totalGrossOutstanding.toFixed(2), startXGross + 3, y + 6, {
    width: wGross - 6,
    align: 'right'
  });

  doc.text(totalAmountSum.toFixed(2), startXGross + wGross + 3, y + 6, {
    width: wTotal - 6,
    align: 'right'
  });

  doc.text(summary.totalRoundedOutstanding.toFixed(2), startXGross + wGross + wTotal + 3, y + 6, {
    width: wRounded - 6,
    align: 'right'
  });

  return y + ROW_H;
}

export async function generateCreditOutstandingCsv(opts: CreditOutstandingExportOpts): Promise<void> {
  const { rows, summary, outputPath } = opts;
  const HEADER = [
    "SNo.", "Billed Date", "Bill Number", "MRN", "Visit Type", "Patient Name",
    "Doctor Name", "Scheme", "Company Name",
    "Gross Amount", "Total Amount", "Rounded Amount",
    "Payment Mode", "Bill Payment Status", "Type",
  ];

  let csvContent = HEADER.join(",") + "\n";
  for (const r of rows) {
    const rowValues = [
      r.sNo,
      r.billedDate,
      r.billNumber,
      r.mrn,
      r.visitType,
      r.patientName,
      r.doctorName,
      r.scheme,
      r.companyName,
      r.grossAmount.toFixed(2),
      r.totalAmount.toFixed(2),
      r.roundedAmount.toFixed(2),
      r.paymentMode,
      r.billPaymentStatus,
      r.type
    ].map(val => {
      const strVal = String(val === null || val === undefined ? '' : val);
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    });
    csvContent += rowValues.join(",") + "\n";
  }

  csvContent += "\n";

  const totalRow = Array(HEADER.length).fill("");
  totalRow[0] = "TOTAL";
  totalRow[9] = summary.totalGrossOutstanding.toFixed(2);
  const totalAmountSum = rows.reduce((sum, r) => sum + r.totalAmount, 0);
  totalRow[10] = totalAmountSum.toFixed(2);
  totalRow[11] = summary.totalRoundedOutstanding.toFixed(2);
  csvContent += totalRow.join(",") + "\n";

  await fs.promises.writeFile(outputPath, csvContent, 'utf-8');
}

export async function generateCreditOutstandingExcel(opts: CreditOutstandingExportOpts): Promise<void> {
  const { rows, summary, tenant, fromDate, toDate, outputPath } = opts;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MIS Report Backend';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Credit Outstanding', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
  });

  const HEADER = [
    "SNo.", "Billed Date", "Bill Number", "MRN", "Visit Type", "Patient Name",
    "Doctor Name", "Scheme", "Company Name",
    "Gross Amount", "Total Amount", "Rounded Amount",
    "Payment Mode", "Bill Payment Status", "Type",
  ];

  sheet.columns = HEADER.map((h, i) => {
    const widths = [6, 20, 18, 14, 12, 24, 32, 16, 32, 14, 14, 16, 14, 16, 10];
    return { key: `col_${i + 1}`, width: widths[i] };
  });

  const LAST_COL = 'O';
  const NAVY = '0F2D52';
  const NAVY_2 = '1A3C5E';
  const SOFT = 'E8EEF4';
  const SHADE = 'F0F4F8';
  const WHITE = 'FFFFFF';
  const DANGER = 'FFE5E5';
  const GOLD = 'FFF1C2';

  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
  const HEADER_FILL_2: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY_2}` } };
  const SOFT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SOFT}` } };
  const SHADE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SHADE}` } };
  const WHITE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${WHITE}` } };
  const DANGER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DANGER}` } };
  const GOLD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GOLD}` } };

  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD0D8E4' } },
    left: { style: 'thin', color: { argb: 'FFD0D8E4' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D8E4' } },
    right: { style: 'thin', color: { argb: 'FFD0D8E4' } },
  };

  // Title Row
  sheet.mergeCells(`A1:${LAST_COL}1`);
  const titleRow = sheet.getRow(1);
  titleRow.height = 32;
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'PHARMACY CREDIT OUTSTANDING REPORT';
  titleCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle Row
  sheet.mergeCells(`A2:${LAST_COL}2`);
  const subRow = sheet.getRow(2);
  subRow.height = 20;
  const subCell = sheet.getCell('A2');
  const TENANT_DISPLAY_NAME = "eCare360 Multi-Specialty Hospital";
  subCell.value = `${TENANT_DISPLAY_NAME}   •   Tenant: ${tenant}   •   Period: ${fromDate} → ${toDate}`;
  subCell.font = { italic: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  subCell.fill = HEADER_FILL_2;
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Summary Tiles
  const tiles = [
    { label: "BILLS SCANNED (UNPAID)", value: String(summary.billsScanned) },
    { label: "PHARMACY BILLS", value: String(summary.pharmacyBills) },
    { label: "CREDIT-MODE BILLS", value: String(summary.creditModeBills) },
    { label: "OUTSTANDING (GROSS)", value: `INR ${summary.totalGrossOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: "OUTSTANDING (ROUNDED)", value: `INR ${summary.totalRoundedOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  const span = 3;
  tiles.forEach((tile, i) => {
    const c0 = i * span + 1;
    const c1 = (i + 1) * span;

    sheet.mergeCells(3, c0, 3, c1);
    const labelCell = sheet.getCell(3, c0);
    labelCell.value = tile.label;
    labelCell.font = { bold: true, size: 8, color: { argb: 'FF1A3C5E' } };
    labelCell.fill = SOFT_FILL;
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(4, c0, 4, c1);
    const valCell = sheet.getCell(4, c0);
    valCell.value = tile.value;
    valCell.font = { bold: true, size: 13, color: { argb: 'FF0F2D52' } };
    valCell.fill = WHITE_FILL;
    valCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  sheet.getRow(3).height = 16;
  sheet.getRow(4).height = 24;
  sheet.getRow(5).height = 6;

  // Table Headers
  const tableHeaderRow = sheet.getRow(6);
  tableHeaderRow.height = 32;
  HEADER.forEach((h, i) => {
    const cell = tableHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    const isCenter = [0, 9, 10, 11, 14].includes(i);
    cell.alignment = { horizontal: isCenter ? 'center' : 'left', vertical: 'middle', wrapText: true };
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6, topLeftCell: 'A7', activeCell: 'A7' }];

  // Data Rows
  rows.forEach((row, idx) => {
    const rIdx = idx + 7;
    const excelRow = sheet.getRow(rIdx);
    
    const isReturn = row.type === 'Return';
    const fill = isReturn ? DANGER_FILL : (rIdx % 2 === 0 ? SHADE_FILL : WHITE_FILL);

    const cellValues = [
      row.sNo,
      row.billedDate,
      row.billNumber,
      row.mrn,
      row.visitType,
      row.patientName,
      row.doctorName,
      row.scheme,
      row.companyName,
      row.grossAmount,
      row.totalAmount,
      row.roundedAmount,
      row.paymentMode,
      row.billPaymentStatus,
      row.type
    ];

    cellValues.forEach((val, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { 
        size: 10, 
        color: { argb: isReturn ? 'FFB91C1C' : 'FF1A1A2E' },
        bold: isReturn && [10, 11, 12].includes(cIdx + 1)
      };
      cell.fill = fill;
      cell.border = THIN_BORDER;

      const isCenter = [1, 15].includes(cIdx + 1);
      const isRight = [10, 11, 12].includes(cIdx + 1);
      cell.alignment = {
        horizontal: isCenter ? 'center' : (isRight ? 'right' : 'left'),
        vertical: 'middle',
        wrapText: true
      };

      if (isRight) {
        cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      }
    });

    excelRow.height = 20;
  });

  const totalsRowIdx = rows.length + 7;
  const totalRow = sheet.getRow(totalsRowIdx);
  totalRow.height = 22;

  sheet.mergeCells(totalsRowIdx, 1, totalsRowIdx, 9);
  const totalLabelCell = totalRow.getCell(1);
  totalLabelCell.value = 'TOTAL';
  totalLabelCell.font = { bold: true, size: 11, color: { argb: 'FF0F2D52' } };
  totalLabelCell.fill = GOLD_FILL;
  totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totalLabelCell.border = THIN_BORDER;

  for (let i = 2; i <= 9; i++) {
    totalRow.getCell(i).fill = GOLD_FILL;
    totalRow.getCell(i).border = THIN_BORDER;
  }

  const totalAmountSum = rows.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalsData = [
    { col: 10, value: summary.totalGrossOutstanding },
    { col: 11, value: totalAmountSum },
    { col: 12, value: summary.totalRoundedOutstanding }
  ];

  totalsData.forEach((td) => {
    const cell = totalRow.getCell(td.col);
    cell.value = td.value;
    cell.font = { bold: true, size: 11, color: { argb: 'FF0F2D52' } };
    cell.fill = GOLD_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.numFmt = '#,##0.00;[Red]-#,##0.00';
  });

  for (let i = 13; i <= 15; i++) {
    const cell = totalRow.getCell(i);
    cell.value = '';
    cell.fill = GOLD_FILL;
    cell.border = THIN_BORDER;
  }

  const footerRowIdx = totalsRowIdx + 2;
  sheet.mergeCells(footerRowIdx, 1, footerRowIdx, 15);
  const footerCell = sheet.getCell(footerRowIdx, 1);
  const printTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  footerCell.value = `Generated ${printTimeStr} IST   •   Source: pharmacy + credit mode + UNPAID/REFUNDED bills (BillReport ⋈ Order ⋈ Payment ⋈ Transaction)`;
  footerCell.font = { size: 8, italic: true, color: { argb: 'FF6B7280' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };

  if (rows.length > 0) {
    sheet.autoFilter = { from: 'A6', to: `${LAST_COL}${totalsRowIdx - 1}` };
  }

  await workbook.xlsx.writeFile(outputPath);
}

export async function generateCreditOutstandingPdf(opts: CreditOutstandingExportOpts): Promise<void> {
  const { rows, summary, tenant, fromDate, toDate, outputPath } = opts;

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: MARGIN, bottom: MARGIN + 20, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    bufferPages: true
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  let y = MARGIN;

  // 1. Draw Title Header
  doc.fillColor('#0F2D52').rect(MARGIN, y, CONTENT_WIDTH, 26).fill();
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#FFFFFF');
  doc.text('PHARMACY CREDIT OUTSTANDING REPORT', MARGIN, y + 6, { align: 'center', width: CONTENT_WIDTH });
  y += 26;

  doc.fillColor('#1A3C5E').rect(MARGIN, y, CONTENT_WIDTH, 18).fill();
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#FFFFFF');
  const TENANT_DISPLAY_NAME = "eCare360 Multi-Specialty Hospital";
  doc.text(`${TENANT_DISPLAY_NAME}   •   Tenant: ${tenant}   •   Period: ${fromDate} → ${toDate}`, MARGIN, y + 4, { align: 'center', width: CONTENT_WIDTH });
  y += 18 + 6;

  // 2. Draw Summary Tiles
  const tiles = [
    { label: "BILLS SCANNED", value: String(summary.billsScanned) },
    { label: "PHARMACY BILLS", value: String(summary.pharmacyBills) },
    { label: "CREDIT-MODE BILLS", value: String(summary.creditModeBills) },
    { label: "OUTSTANDING (GROSS)", value: `INR ${summary.totalGrossOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: "OUTSTANDING (ROUNDED)", value: `INR ${summary.totalRoundedOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];
  
  const tileWidth = CONTENT_WIDTH / tiles.length;
  doc.fillColor('#E8EEF4').rect(MARGIN, y, CONTENT_WIDTH, 12).fill();
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#1A3C5E');
  tiles.forEach((tile, i) => {
    doc.text(tile.label, MARGIN + i * tileWidth + 3, y + 3, { width: tileWidth - 6, align: 'center' });
  });
  
  doc.strokeColor('#D0D8E4').lineWidth(0.4);
  for (let i = 0; i <= tiles.length; i++) {
    doc.moveTo(MARGIN + i * tileWidth, y).lineTo(MARGIN + i * tileWidth, y + 12).stroke();
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke();
  doc.moveTo(MARGIN, y + 12).lineTo(MARGIN + CONTENT_WIDTH, y + 12).stroke();
  y += 12;

  doc.fillColor('#FFFFFF').rect(MARGIN, y, CONTENT_WIDTH, 20).fill();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2D52');
  tiles.forEach((tile, i) => {
    doc.text(tile.value, MARGIN + i * tileWidth + 3, y + 5, { width: tileWidth - 6, align: 'center' });
  });

  for (let i = 0; i <= tiles.length; i++) {
    doc.moveTo(MARGIN + i * tileWidth, y).lineTo(MARGIN + i * tileWidth, y + 20).stroke();
  }
  doc.moveTo(MARGIN, y + 20).lineTo(MARGIN + CONTENT_WIDTH, y + 20).stroke();
  y += 20 + 8;

  // 3. Draw Table Header
  y = drawTableHeader(doc, y);

  // 4. Draw Table Rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    doc.font('Helvetica').fontSize(7.5);
    let maxH = 0;
    const cells = [
      String(row.sNo),
      row.billedDate,
      row.billNumber,
      row.mrn,
      row.visitType,
      row.patientName,
      row.doctorName,
      row.scheme,
      row.companyName,
      row.grossAmount.toFixed(2),
      row.totalAmount.toFixed(2),
      row.roundedAmount.toFixed(2),
      row.paymentMode,
      row.billPaymentStatus,
      row.type
    ];
    cells.forEach((val, idx) => {
      const w = colWidths[idx];
      const h = doc.heightOfString(val, { width: w - 6 });
      if (h > maxH) maxH = h;
    });
    const rowHeight = Math.max(16, maxH + 6);

    if (y + rowHeight > PAGE_H - MARGIN - 20) {
      doc.addPage();
      y = MARGIN;
      y = drawTableHeader(doc, y);
    }

    y = drawRow(doc, row, y, i % 2 === 1);
  }

  // 5. Draw Total Row
  const totalAmountSum = rows.reduce((sum, r) => sum + r.totalAmount, 0);
  if (y + 20 > PAGE_H - MARGIN - 20) {
    doc.addPage();
    y = MARGIN;
    y = drawTableHeader(doc, y);
  }
  y = drawTotalRow(doc, summary, totalAmountSum, y);

  // Buffering & dynamic page number injection
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    drawPageBorder(doc);
    drawPageFooter(doc, i + 1, range.count);
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
