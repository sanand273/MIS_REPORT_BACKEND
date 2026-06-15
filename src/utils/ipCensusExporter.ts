import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as fs from 'fs';

export interface IpCensusRow {
  sno: number;
  speciality: string;
  newCount: number;
  establishedCount: number;
  total: number;
}

export interface IpCensusExportOpts {
  rows: IpCensusRow[];
  startDate: Date;
  endDate: Date;
  outputPath: string;
}

const PAGE_W = 595.28; // A4 Portrait
const PAGE_H = 841.89;
const MARGIN = 42.52; // 15mm in points
const CONTENT_WIDTH = PAGE_W - MARGIN * 2;

const NAVY = '#1F4E79';
const LIGHT = '#EAF2FB';
const GREY = '#555555';
const BORDER_COLOR = '#BBBBBB';

const ROWS_PER_PAGE = 25;

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function generateIpCensusPdf(opts: IpCensusExportOpts): Promise<void> {
  const { rows, startDate, endDate, outputPath } = opts;
  const printTime = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const grandNew = rows.reduce((sum, r) => sum + r.newCount, 0);
  const grandEst = rows.reduce((sum, r) => sum + r.establishedCount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN + 20, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Column widths: S.No (12mm), Speciality, New (30mm), Established (32mm), Total (25mm)
  const colWidths = [
    34.02, // 12mm
    CONTENT_WIDTH - 34.02 - 85.04 - 90.71 - 70.87,
    85.04, // 30mm
    90.71, // 32mm
    70.87, // 25mm
  ];

  // Chunk rows
  const chunks: IpCensusRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }

  chunks.forEach((chunk, pageIdx) => {
    const pageNo = pageIdx + 1;
    const pageNew = chunk.reduce((sum, r) => sum + r.newCount, 0);
    const pageEst = chunk.reduce((sum, r) => sum + r.establishedCount, 0);
    const pageSum = chunk.reduce((sum, r) => sum + r.total, 0);
    const isLast = pageNo === totalPages;

    if (pageIdx > 0) {
      doc.addPage();
    }

    // 1. Page Border
    doc.strokeColor(NAVY).lineWidth(1.5).rect(MARGIN - 10, MARGIN - 10, PAGE_W - (MARGIN - 10) * 2, PAGE_H - (MARGIN - 10) * 2).stroke();

    // 2. Header
    doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('PORUNAI HOSPITALS', MARGIN, MARGIN + 2, { align: 'center', width: CONTENT_WIDTH });
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text('Department Wise Patient IP Count', { align: 'center', width: CONTENT_WIDTH });
    doc.text(`Report Date: ${formatDate(startDate)} – ${formatDate(endDate)}`, { align: 'center', width: CONTENT_WIDTH });
    doc.fontSize(8).text(`Print Time: ${printTime}`, { align: 'center', width: CONTENT_WIDTH });

    // Divider lines
    const dividerY = MARGIN + 52;
    doc.strokeColor(NAVY).lineWidth(0.8).moveTo(MARGIN, dividerY).lineTo(MARGIN + CONTENT_WIDTH, dividerY).stroke();
    doc.strokeColor(GREY).lineWidth(0.3).moveTo(MARGIN, dividerY + 3).lineTo(MARGIN + CONTENT_WIDTH, dividerY + 3).stroke();

    // 3. Table Header
    let y = dividerY + 12;
    doc.fillColor(NAVY).rect(MARGIN, y, CONTENT_WIDTH, 20).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');

    // Draw header text
    doc.text('S.No', MARGIN + 4, y + 6, { width: colWidths[0] - 8, align: 'center' });
    doc.text('Speciality', MARGIN + colWidths[0] + 4, y + 6, { width: colWidths[1] - 8, align: 'left' });
    doc.text('New Patients', MARGIN + colWidths[0] + colWidths[1] + 4, y + 6, { width: colWidths[2] - 8, align: 'center' });
    doc.text('Established', MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + 4, y + 6, { width: colWidths[3] - 8, align: 'center' });
    doc.text('Total', MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 4, y + 6, { width: colWidths[4] - 8, align: 'center' });

    y += 20;

    // 4. Table Rows
    doc.fontSize(9).fillColor('#1A1A2E');
    chunk.forEach((row, i) => {
      const isAlt = i % 2 === 1;
      doc.fillColor(isAlt ? LIGHT : '#FFFFFF').rect(MARGIN, y, CONTENT_WIDTH, 18).fill();

      // Outer row border
      doc.strokeColor(BORDER_COLOR).lineWidth(0.3).moveTo(MARGIN, y + 18).lineTo(MARGIN + CONTENT_WIDTH, y + 18).stroke();

      // Column divider lines
      let currentX = MARGIN;
      colWidths.forEach((w) => {
        currentX += w;
        doc.strokeColor(BORDER_COLOR).lineWidth(0.3).moveTo(currentX, y).lineTo(currentX, y + 18).stroke();
      });

      // Text cells
      doc.font('Helvetica').fillColor('#1A1A2E');
      doc.text(String(row.sno), MARGIN + 4, y + 5, { width: colWidths[0] - 8, align: 'center' });
      doc.text(row.speciality, MARGIN + colWidths[0] + 4, y + 5, { width: colWidths[1] - 8, align: 'left', lineBreak: false });
      doc.text(String(row.newCount), MARGIN + colWidths[0] + colWidths[1] + 4, y + 5, { width: colWidths[2] - 8, align: 'center' });
      doc.text(String(row.establishedCount), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + 4, y + 5, { width: colWidths[3] - 8, align: 'center' });
      doc.text(String(row.total), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 4, y + 5, { width: colWidths[4] - 8, align: 'center' });

      y += 18;
    });

    // 5. Page Total Row
    doc.fillColor('#D6E4F0').rect(MARGIN, y, CONTENT_WIDTH, 18).fill();
    doc.strokeColor(BORDER_COLOR).lineWidth(0.3).rect(MARGIN, y, CONTENT_WIDTH, 18).stroke();
    doc.font('Helvetica-Bold').fillColor('#1A1A2E');
    doc.text('Page Total', MARGIN + colWidths[0] + 4, y + 5, { width: colWidths[1] - 8, align: 'left' });
    doc.text(String(pageNew), MARGIN + colWidths[0] + colWidths[1] + 4, y + 5, { width: colWidths[2] - 8, align: 'center' });
    doc.text(String(pageEst), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + 4, y + 5, { width: colWidths[3] - 8, align: 'center' });
    doc.text(String(pageSum), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 4, y + 5, { width: colWidths[4] - 8, align: 'center' });
    y += 18;

    // 6. Grand Total Row (Last page only)
    if (isLast) {
      doc.fillColor(NAVY).rect(MARGIN, y, CONTENT_WIDTH, 20).fill();
      doc.strokeColor(BORDER_COLOR).lineWidth(0.3).rect(MARGIN, y, CONTENT_WIDTH, 20).stroke();
      doc.font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Grand Total', MARGIN + colWidths[0] + 4, y + 6, { width: colWidths[1] - 8, align: 'left' });
      doc.text(String(grandNew), MARGIN + colWidths[0] + colWidths[1] + 4, y + 6, { width: colWidths[2] - 8, align: 'center' });
      doc.text(String(grandEst), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + 4, y + 6, { width: colWidths[3] - 8, align: 'center' });
      doc.text(String(grandTotal), MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 4, y + 6, { width: colWidths[4] - 8, align: 'center' });
      y += 20;
    }

    // 7. Footer
    const footerY = PAGE_H - MARGIN;
    doc.strokeColor(GREY).lineWidth(0.5).moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_WIDTH, footerY).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Page ${pageNo} of ${totalPages}`, MARGIN, footerY + 5, { align: 'right', width: CONTENT_WIDTH });
  });

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export async function generateIpCensusExcel(opts: IpCensusExportOpts): Promise<void> {
  const { rows, startDate, endDate, outputPath } = opts;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IP Census Report';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('IP Census Report', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  });

  sheet.columns = [
    { key: 'sno', width: 8 },
    { key: 'speciality', width: 40 },
    { key: 'newCount', width: 16 },
    { key: 'establishedCount', width: 16 },
    { key: 'total', width: 12 },
  ];

  const LAST_COL = 'E';
  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  const LIGHT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };
  const WHITE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
    right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  };

  // 1. Title Row
  sheet.mergeCells(`A1:${LAST_COL}1`);
  const titleRow = sheet.getRow(1);
  titleRow.height = 28;
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'PORUNAI HOSPITALS';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. Subtitle Row
  sheet.mergeCells(`A2:${LAST_COL}2`);
  const subRow = sheet.getRow(2);
  subRow.height = 18;
  const subCell = sheet.getCell('A2');
  subCell.value = 'Department Wise Patient IP Count';
  subCell.font = { bold: true, size: 10, color: { argb: 'FF1F4E79' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 3. Date Range Row
  sheet.mergeCells(`A3:${LAST_COL}3`);
  const dateRow = sheet.getRow(3);
  dateRow.height = 18;
  const dateCell = sheet.getCell('A3');
  dateCell.value = `Report Date: ${formatDate(startDate)} – ${formatDate(endDate)}`;
  dateCell.font = { size: 9, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Empty spacer
  sheet.addRow([]);

  // 4. Table Headers
  const headerRow = sheet.getRow(5);
  headerRow.height = 22;
  const headers = ['S.No', 'Speciality', 'New Patients', 'Established', 'Total'];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle' };
  });

  // 5. Data Rows
  rows.forEach((row, idx) => {
    const excelRow = sheet.addRow([
      row.sno,
      row.speciality,
      row.newCount,
      row.establishedCount,
      row.total,
    ]);
    excelRow.height = 18;
    const isAlt = idx % 2 === 1;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 9 };
      cell.fill = isAlt ? LIGHT_FILL : WHITE_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = {
        horizontal: colNum === 2 ? 'left' : 'center',
        vertical: 'middle',
      };
    });
  });

  // 6. Grand Total
  const grandNew = rows.reduce((sum, r) => sum + r.newCount, 0);
  const grandEst = rows.reduce((sum, r) => sum + r.establishedCount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const totalRow = sheet.addRow(['', 'Grand Total', grandNew, grandEst, grandTotal]);
  totalRow.height = 20;
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = {
      horizontal: colNum === 2 ? 'left' : 'center',
      vertical: 'middle',
    };
  });

  await workbook.xlsx.writeFile(outputPath);
}
