import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as fs from 'fs';

export interface DayDutyRow {
  sno: number;
  name: string;
  mrn: string;
  doa: string;
  roomNo: string;
  doctorName: string;
  remarks: string;
}

export interface DayDutyExportOpts {
  rows: DayDutyRow[];
  today: Date;
  admissionCount: number;
  dischargeCount: number;
  totalIP: number;
  proNames: string;
  outputPath: string;
}

const MARGIN = 40;
const PAGE_WIDTH = 841.89; // A4 landscape
const PAGE_HEIGHT = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLS = [
  { header: 'S.No', weight: 0.05 },
  { header: 'Name', weight: 0.18 },
  { header: 'MRN', weight: 0.1 },
  { header: 'DOA', weight: 0.1 },
  { header: 'Room No', weight: 0.12 },
  { header: 'Doctor Name', weight: 0.18 },
  { header: 'Remarks (Scheme)', weight: 0.27 },
];

function colWidths(): number[] {
  return COLS.map((c) => c.weight * CONTENT_WIDTH);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const widths = colWidths();
  const ROW_H = 22;

  doc.fillColor('#1a3c5e').rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');

  let x = MARGIN;
  for (let i = 0; i < COLS.length; i++) {
    doc.text(COLS[i].header, x + 4, y + 6, {
      width: widths[i] - 8,
      align: i === 0 ? 'center' : 'left',
      lineBreak: false,
    });
    x += widths[i];
  }

  doc.y = y + ROW_H;
  return y + ROW_H;
}

function drawRow(doc: PDFKit.PDFDocument, row: DayDutyRow, y: number, shade: boolean): number {
  const widths = colWidths();
  const values = [
    String(row.sno),
    row.name,
    row.mrn,
    row.doa,
    row.roomNo,
    row.doctorName,
    row.remarks,
  ];

  doc.font('Helvetica').fontSize(8);
  let maxH = 0;
  for (let i = 0; i < values.length; i++) {
    const h = doc.heightOfString(values[i], { width: widths[i] - 8 });
    if (h > maxH) maxH = h;
  }
  const ROW_H = Math.max(18, maxH + 8);

  doc
    .fillColor(shade ? '#f0f4f8' : '#ffffff')
    .rect(MARGIN, y, CONTENT_WIDTH, ROW_H)
    .fill();

  doc
    .strokeColor('#d0d8e4')
    .lineWidth(0.5)
    .moveTo(MARGIN, y + ROW_H)
    .lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H)
    .stroke();

  doc.font('Helvetica').fontSize(8).fillColor('#1a1a2e');
  let x = MARGIN;
  for (let i = 0; i < values.length; i++) {
    doc.text(values[i], x + 4, y + 5, {
      width: widths[i] - 8,
      align: i === 0 ? 'center' : 'left',
    });
    x += widths[i];
  }

  doc.strokeColor('#d0d8e4').lineWidth(0.3);
  x = MARGIN;
  for (let i = 0; i < widths.length - 1; i++) {
    x += widths[i];
    doc.moveTo(x, y).lineTo(x, y + ROW_H).stroke();
  }

  doc.y = y + ROW_H;
  return y + ROW_H;
}

function drawPageBorder(doc: PDFKit.PDFDocument) {
  doc
    .strokeColor('#1a3c5e')
    .lineWidth(1.5)
    .rect(MARGIN - 10, MARGIN - 10, PAGE_WIDTH - (MARGIN - 10) * 2, PAGE_HEIGHT - (MARGIN - 10) * 2)
    .stroke();
}

export async function generateDayDutyPdf(opts: DayDutyExportOpts): Promise<void> {
  const { rows, today, admissionCount, dischargeCount, totalIP, proNames, outputPath } = opts;

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  let pageNum = 1;

  function renderPageHeader(): number {
    drawPageBorder(doc);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#1a3c5e')
      .text('DAY DUTY REPORT', MARGIN, MARGIN + 2, { align: 'center', width: CONTENT_WIDTH });

    doc
      .strokeColor('#1a3c5e')
      .lineWidth(1)
      .moveTo(MARGIN, MARGIN + 24)
      .lineTo(MARGIN + CONTENT_WIDTH, MARGIN + 24)
      .stroke();

    const summaryY = MARGIN + 30;
    const colW = CONTENT_WIDTH / 4;
    const summaryItems = [
      { label: 'Date', value: formatDate(today) },
      { label: 'Admission', value: String(admissionCount) },
      { label: 'Discharge', value: String(dischargeCount) },
      { label: 'Total IP', value: String(totalIP) },
    ];

    summaryItems.forEach((item, i) => {
      const sx = MARGIN + i * colW;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1a3c5e')
        .text(`${item.label}:`, sx, summaryY, { continued: true })
        .font('Helvetica')
        .fillColor('#1a1a2e')
        .text(` ${item.value}`, { width: colW - 4 });
    });

    const proY = summaryY + 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#1a3c5e')
      .text('PRO:', MARGIN, proY, { continued: true })
      .font('Helvetica')
      .fillColor('#1a1a2e')
      .text(` ${proNames || '-'}`, { width: CONTENT_WIDTH - 4 });

    const ruleY = doc.y + 4;
    doc
      .strokeColor('#1a3c5e')
      .lineWidth(0.5)
      .moveTo(MARGIN, ruleY)
      .lineTo(MARGIN + CONTENT_WIDTH, ruleY)
      .stroke();

    return ruleY + 4;
  }

  let y = renderPageHeader();
  y = drawTableHeader(doc, y);

  for (let i = 0; i < rows.length; i++) {
    if (y > PAGE_HEIGHT - MARGIN - 30) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#888888')
        .text(`Page ${pageNum}`, MARGIN, PAGE_HEIGHT - MARGIN, {
          width: CONTENT_WIDTH,
          align: 'right',
        });

      doc.addPage();
      pageNum++;
      y = renderPageHeader();
      y = drawTableHeader(doc, y);
    }

    y = drawRow(doc, rows[i], y, i % 2 === 1);
  }

  doc
    .strokeColor('#1a3c5e')
    .lineWidth(0.8)
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#888888')
    .text(`Page ${pageNum}`, MARGIN, PAGE_HEIGHT - MARGIN, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

  if (rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#888888')
      .text('No in-bed patients found for this tenant.', MARGIN, y + 20, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export async function generateDayDutyExcel(opts: DayDutyExportOpts): Promise<void> {
  const { rows, today, admissionCount, dischargeCount, totalIP, proNames, outputPath } = opts;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Day Duty Report';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Day Duty Report', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  });

  sheet.columns = [
    { key: 'sno', width: 6 },
    { key: 'name', width: 28 },
    { key: 'mrn', width: 14 },
    { key: 'doa', width: 14 },
    { key: 'roomNo', width: 18 },
    { key: 'doctorName', width: 28 },
    { key: 'remarks', width: 40 },
  ];

  const LAST_COL = 'G';
  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c5e' } };
  const SHADE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0f4f8' } };
  const WHITE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFd0d8e4' } },
    left: { style: 'thin', color: { argb: 'FFd0d8e4' } },
    bottom: { style: 'thin', color: { argb: 'FFd0d8e4' } },
    right: { style: 'thin', color: { argb: 'FFd0d8e4' } },
  };

  sheet.mergeCells(`A1:${LAST_COL}1`);
  const titleRow = sheet.getRow(1);
  titleRow.height = 28;
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'DAY DUTY REPORT';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const summaryRow = sheet.getRow(2);
  summaryRow.height = 18;

  const summaryPairs = [
    ['Date', formatDate(today)],
    ['Admission', String(admissionCount)],
    ['Discharge', String(dischargeCount)],
    ['Total IP', String(totalIP)],
  ];

  const summaryColMap = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  summaryPairs.forEach(([label, value], i) => {
    const labelCol = summaryColMap[i * 2] ?? summaryColMap[summaryColMap.length - 1];
    const valueCol = summaryColMap[i * 2 + 1] ?? summaryColMap[summaryColMap.length - 1];

    const lc = sheet.getCell(`${labelCol}2`);
    lc.value = `${label}:`;
    lc.font = { bold: true, size: 9, color: { argb: 'FF1a3c5e' } };
    lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8eef4' } };
    lc.alignment = { horizontal: 'right', vertical: 'middle' };

    if (i < 3) {
      const vc = sheet.getCell(`${valueCol}2`);
      vc.value = value;
      vc.font = { size: 9 };
      vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8eef4' } };
      vc.alignment = { horizontal: 'left', vertical: 'middle' };
    } else {
      lc.value = `Total IP: ${value}`;
      lc.alignment = { horizontal: 'left', vertical: 'middle' };
    }
  });

  sheet.mergeCells(`A3:${LAST_COL}3`);
  const proRow = sheet.getRow(3);
  proRow.height = 18;
  const proCell = sheet.getCell('A3');
  proCell.value = `PRO: ${proNames || '-'}`;
  proCell.font = { size: 9 };
  proCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8eef4' } };
  proCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  const tableHeaderRow = sheet.getRow(4);
  tableHeaderRow.height = 20;
  const headers = COLS.map((c) => c.header);
  headers.forEach((h, i) => {
    const cell = tableHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: i === 0 ? 'center' : 'left', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5', activeCell: 'A5' }];
  sheet.autoFilter = { from: 'A4', to: `${LAST_COL}4` };

  rows.forEach((row, idx) => {
    const excelRow = sheet.addRow([
      row.sno,
      row.name,
      row.mrn,
      row.doa,
      row.roomNo,
      row.doctorName,
      row.remarks,
    ]);
    excelRow.height = 17;
    const fill = idx % 2 === 1 ? SHADE_FILL : WHITE_FILL;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 9 };
      cell.fill = fill;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: colNum === 1 ? 'center' : 'left', vertical: 'middle', wrapText: true };
    });
  });

  if (rows.length === 0) {
    sheet.mergeCells(`A5:${LAST_COL}5`);
    const emptyCell = sheet.getCell('A5');
    emptyCell.value = 'No in-bed patients found for this tenant.';
    emptyCell.font = { italic: true, color: { argb: 'FF888888' } };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  await workbook.xlsx.writeFile(outputPath);
}
