import { reportRepository } from '../repositories/reportRepository.js';
import { logger } from '../utils/logger.js';
import { generateDayDutyPdf, generateDayDutyExcel, DayDutyRow } from '../utils/dayDutyExporter.js';
import { generateOpCensusPdf, generateOpCensusExcel } from '../utils/opCensusExporter.js';
import { generateIpCensusPdf, generateIpCensusExcel } from '../utils/ipCensusExporter.js';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

export interface ReportFilters {
  tenant: string;
  from: string;
  to: string;
  page?: number;
  limit?: number;
  search?: string;
}

export class ReportService {
  /**
   * Processes, calculates, and paginates credit outstanding records.
   */
  async getCreditOutstandingReport(filters: ReportFilters) {
    const tenant = filters.tenant;
    const fromDate = new Date(filters.from);
    // Set end date to end of day (23:59:59.999)
    const toDate = new Date(filters.to);
    toDate.setHours(23, 59, 59, 999);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const search = filters.search?.toLowerCase() || '';

    // Fetch from Repository
    const rawData = await reportRepository.getRawCreditOutstandingData(tenant, fromDate, toDate);
    
    if (rawData.bills.length === 0) {
      return this.emptyResponse(page, limit);
    }

    const orderMap = new Map(rawData.orders.map((o) => [o._id.toString(), o]));
    const txMap = new Map(rawData.transactions.map((t) => [t._id.toString(), t]));

    // Map payments to their transaction modes
    const paymentTxModes = new Map<string, string[]>();
    for (const p of rawData.payments) {
      const modes: string[] = [];
      for (const tid of p.transactions || []) {
        const tx = txMap.get(tid.toString());
        if (tx && tx.mode) {
          modes.push(tx.mode.toUpperCase());
        }
      }
      paymentTxModes.set(p._id.toString(), modes);
      if (p.billId) paymentTxModes.set(p.billId.toString(), modes);
    }

    // Filter to Credit-Mode bills only
    const creditBills = rawData.bills.filter((bill) => {
      // Check if any payment mode linked to bill is CREDIT
      const directModes = paymentTxModes.get(bill.paymentId?.toString()) || [];
      const linkedModes = paymentTxModes.get(bill._id.toString()) || [];
      const combinedModes = [...directModes, ...linkedModes];
      return combinedModes.includes('CREDIT');
    });

    let grossSum = 0;
    let roundedSum = 0;
    const records: any[] = [];

    // Map rows and compute totals
    creditBills.forEach((bill, idx) => {
      const order = orderMap.get(bill.orderId?.toString()) || {};
      const directModes = paymentTxModes.get(bill.paymentId?.toString()) || [];
      const linkedModes = paymentTxModes.get(bill._id.toString()) || [];
      const paymentMode = Array.from(new Set([...directModes, ...linkedModes])).sort().join(' | ') || 'N/A';

      const isReturn = bill.paymentStatus === 'REFUNDED';
      const mult = isReturn ? -1 : 1;

      const grossAmount = (bill.totalAmount || 0) * mult;
      const totalAmount = ((bill.grandTotal || 0) - (bill.roundOff || 0)) * mult;
      const roundedAmount = (bill.grandTotal || 0) * mult;

      grossSum += grossAmount;
      roundedSum += roundedAmount;

      const record = {
        sNo: idx + 1,
        billedDate: bill.billedAt ? new Date(bill.billedAt).toISOString().replace('T', ' ').substring(0, 19) : '-',
        billNumber: bill.billNo || '-',
        mrn: bill.MRN || '-',
        visitType: bill.patientType || '-',
        patientName: bill.patientName || '-',
        doctorName: order.doctorName || '-',
        scheme: order.schemeName || '-',
        companyName: order.companyName || '-',
        grossAmount,
        totalAmount,
        roundedAmount,
        paymentMode,
        billPaymentStatus: bill.paymentStatus || '-',
        type: isReturn ? 'Return' : 'Sale',
      };

      records.push(record);
    });

    // Apply Search Filter (on Bill No, MRN, Patient Name)
    const filteredRecords = records.filter(
      (r) =>
        r.billNumber.toLowerCase().includes(search) ||
        r.mrn.toLowerCase().includes(search) ||
        r.patientName.toLowerCase().includes(search)
    );

    // Re-index SNo after filter
    filteredRecords.forEach((r, idx) => {
      r.sNo = idx + 1;
    });

    // Paginate in memory
    const total = filteredRecords.length;
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return {
      success: true,
      records: paginatedRecords,
      summary: {
        billsScanned: rawData.bills.length,
        pharmacyBills: rawData.bills.length,
        creditModeBills: creditBills.length,
        totalGrossOutstanding: grossSum,
        totalRoundedOutstanding: roundedSum,
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Executes the Python report script to output Excel, PDF, or CSV.
   */
  async exportReportFile(filters: ReportFilters, format: 'csv' | 'xlsx' | 'pdf'): Promise<{ filePath: string; contentType: string }> {
    const pythonScript = path.resolve('./generate_credit_outstanding_pharmacy_report.py');
    const outDir = path.resolve('./'); // Saves to server root
    
    // Command line construction
    const cmd = `python3 "${pythonScript}" --from "${filters.from}" --to "${filters.to}" --tenant "${filters.tenant}" --outdir "${outDir}"`;
    logger.info(`Executing export helper command: ${cmd}`);

    try {
      await execPromise(cmd);
      
      // Locate the generated file
      // Format generated file name: credit_outstanding_pharmacy_[tenant]_[from]_to_[to]_[timestamp].[extension]
      const files = fs.readdirSync(outDir);
      const regex = new RegExp(`credit_outstanding_pharmacy_${filters.tenant}_${filters.from}_to_${filters.to}_.*\\.${format}$`);
      const matchedFile = files.find(f => regex.test(f));

      if (!matchedFile) {
        throw new Error(`Export file not generated by reporter script for format: ${format}`);
      }

      const filePath = path.join(outDir, matchedFile);
      const mimeTypes = {
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      };

      return {
        filePath,
        contentType: mimeTypes[format],
      };
    } catch (err) {
      logger.error(`Python script export failed: ${err}`);
      throw new Error(`Failed to generate ${format.toUpperCase()} report export.`);
    }
  }

  private emptyResponse(page: number, limit: number) {
    return {
      success: true,
      records: [],
      summary: {
        billsScanned: 0,
        pharmacyBills: 0,
        creditModeBills: 0,
        totalGrossOutstanding: 0,
        totalRoundedOutstanding: 0,
      },
      pagination: {
        total: 0,
        page,
        limit,
        pages: 0,
      },
    };
  }

  /**
   * Processes and paginates Day Duty Report data.
   */
  async getDayDutyReport(filters: { tenant: string; date?: string; page?: number; limit?: number; search?: string }) {
    const tenant = filters.tenant;
    const targetDate = filters.date ? new Date(filters.date) : new Date();
    
    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const search = filters.search?.toLowerCase() || '';

    // Fetch from repository
    const rawData = await reportRepository.getRawDayDutyData(tenant, todayStart, todayEnd);

    const roomMap = new Map(rawData.rooms.map((r) => [r._id.toString(), r]));

    // Format list mapping
    const rows: DayDutyRow[] = rawData.patients.map((p, idx) => {
      const room = roomMap.get(p.room?.toString());
      const roomNo = room ? (room.bedName ? `${room.roomName} / ${room.bedName}` : room.roomName) : '-';
      
      return {
        sno: idx + 1,
        name: p.patientName || '-',
        mrn: p.mrn || '-',
        doa: p.dateOfAdmission ? new Date(p.dateOfAdmission).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) : '-',
        roomNo,
        doctorName: p.admittedByDoctorName || '-',
        remarks: p.schemeName || p.remarks || '-',
      };
    });

    // Apply search filter (on name, mrn, doctorName, roomNo)
    const filteredRows = rows.filter((r) => 
      r.name.toLowerCase().includes(search) ||
      r.mrn.toLowerCase().includes(search) ||
      r.doctorName.toLowerCase().includes(search) ||
      r.roomNo.toLowerCase().includes(search)
    );

    // Re-index
    filteredRows.forEach((r, idx) => {
      r.sno = idx + 1;
    });

    const total = filteredRows.length;
    const startIndex = (page - 1) * limit;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);

    const uniquePros = Array.from(new Set(rawData.patients.map((p) => p.proName).filter(Boolean)));
    const proNames = uniquePros.join(', ');

    return {
      success: true,
      records: paginatedRows,
      summary: {
        date: targetDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        admissionCount: rawData.admissionCount,
        dischargeCount: rawData.dischargeCount,
        totalIP: rawData.patients.length,
        proNames,
        proCount: uniquePros.length,
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      }
    };
  }

  /**
   * Generates PDF/Excel files for Day Duty report.
   */
  async exportDayDutyReport(
    filters: { tenant: string; date?: string },
    format: 'pdf' | 'excel'
  ): Promise<{ filePath: string; contentType: string }> {
    const tenant = filters.tenant;
    const targetDate = filters.date ? new Date(filters.date) : new Date();
    
    // We reuse the service logic to fetch all records (page=1, limit=999999)
    const data = await this.getDayDutyReport({ tenant, date: filters.date, page: 1, limit: 999999 });

    const timestamp = targetDate.toISOString().slice(0, 10);
    const outDir = path.resolve('./'); // Saves to server root
    const fileName = `day_duty_report_${tenant}_${timestamp}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const filePath = path.join(outDir, fileName);

    const opts = {
      rows: data.records,
      today: targetDate,
      admissionCount: data.summary.admissionCount,
      dischargeCount: data.summary.dischargeCount,
      totalIP: data.summary.totalIP,
      proNames: data.summary.proNames,
      outputPath: filePath,
    };

    if (format === 'pdf') {
      await generateDayDutyPdf(opts);
    } else {
      await generateDayDutyExcel(opts);
    }

    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return {
      filePath,
      contentType: format === 'pdf' ? mimeTypes.pdf : mimeTypes.excel,
    };
  }

  /**
   * Fetches paginated, filtered specialties and counts for the OP Census report.
   */
  async getOpCensusReport(filters: { tenant: string; from: string; to: string; page?: number; limit?: number; search?: string }) {
    const tenant = filters.tenant;
    const startDate = new Date(filters.from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.to);
    endDate.setHours(23, 59, 59, 999);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const search = filters.search?.toLowerCase() || '';

    // Fetch from Repository
    const rawData = await reportRepository.getRawOpCensusData(tenant, startDate, endDate);

    // Map rows
    const rows = rawData.map((r, idx) => ({
      sno: idx + 1,
      speciality: (r._id || 'Unspecified').trim() || 'Unspecified',
      count: r.count || 0
    }));

    // Filter by Speciality Name
    const filteredRows = rows.filter((r) =>
      r.speciality.toLowerCase().includes(search)
    );

    // Re-index after search filter
    filteredRows.forEach((r, idx) => {
      r.sno = idx + 1;
    });

    const total = filteredRows.length;
    const startIndex = (page - 1) * limit;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);

    const totalAppointments = filteredRows.reduce((sum, r) => sum + r.count, 0);
    const formatDateLocal = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      success: true,
      records: paginatedRows,
      summary: {
        dateRange: `${formatDateLocal(startDate)} – ${formatDateLocal(endDate)}`,
        totalDepartments: filteredRows.length,
        totalAppointments
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Generates and exports PDF/Excel files for the OP Census report.
   */
  async exportOpCensusReport(
    filters: { tenant: string; from: string; to: string },
    format: 'pdf' | 'excel'
  ): Promise<{ filePath: string; contentType: string }> {
    const tenant = filters.tenant;
    const startDate = new Date(filters.from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.to);
    endDate.setHours(23, 59, 59, 999);

    // Reuse service logic to fetch all records without pagination
    const data = await this.getOpCensusReport({ tenant, from: filters.from, to: filters.to, page: 1, limit: 999999 });

    const timestamp = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`;
    const outDir = path.resolve('./'); // Saves to server root
    const fileName = `op_census_report_${tenant}_${timestamp}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const filePath = path.join(outDir, fileName);

    const opts = {
      rows: data.records,
      startDate,
      endDate,
      outputPath: filePath
    };

    if (format === 'pdf') {
      await generateOpCensusPdf(opts);
    } else {
      await generateOpCensusExcel(opts);
    }

    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return {
      filePath,
      contentType: format === 'pdf' ? mimeTypes.pdf : mimeTypes.excel
    };
  }

  /**
   * Fetches paginated, filtered specialties and counts for the IP Census report.
   */
  async getIpCensusReport(filters: { tenant: string; from: string; to: string; page?: number; limit?: number; search?: string }) {
    const tenant = filters.tenant;
    const startDate = new Date(filters.from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.to);
    endDate.setHours(23, 59, 59, 999);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const search = filters.search?.toLowerCase() || '';

    // Fetch from Repository
    const rawData = await reportRepository.getRawIpCensusData(tenant, startDate, endDate);

    // Map rows
    const rows = rawData.map((r, idx) => ({
      sno: idx + 1,
      speciality: (r._id || 'Unspecified').trim() || 'Unspecified',
      newCount: r.new_count || 0,
      establishedCount: r.established_count || 0,
      total: r.total || 0
    }));

    // Filter by Speciality Name
    const filteredRows = rows.filter((r) =>
      r.speciality.toLowerCase().includes(search)
    );

    // Re-index after search filter
    filteredRows.forEach((r, idx) => {
      r.sno = idx + 1;
    });

    const total = filteredRows.length;
    const startIndex = (page - 1) * limit;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);

    const totalNew = filteredRows.reduce((sum, r) => sum + r.newCount, 0);
    const totalEstablished = filteredRows.reduce((sum, r) => sum + r.establishedCount, 0);
    const totalAdmissions = filteredRows.reduce((sum, r) => sum + r.total, 0);
    const formatDateLocal = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      success: true,
      records: paginatedRows,
      summary: {
        dateRange: `${formatDateLocal(startDate)} – ${formatDateLocal(endDate)}`,
        totalDepartments: filteredRows.length,
        totalNew,
        totalEstablished,
        totalAdmissions
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Generates and exports PDF/Excel files for the IP Census report.
   */
  async exportIpCensusReport(
    filters: { tenant: string; from: string; to: string },
    format: 'pdf' | 'excel'
  ): Promise<{ filePath: string; contentType: string }> {
    const tenant = filters.tenant;
    const startDate = new Date(filters.from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.to);
    endDate.setHours(23, 59, 59, 999);

    // Reuse service logic to fetch all records without pagination
    const data = await this.getIpCensusReport({ tenant, from: filters.from, to: filters.to, page: 1, limit: 999999 });

    const timestamp = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`;
    const outDir = path.resolve('./'); // Saves to server root
    const fileName = `ip_census_report_${tenant}_${timestamp}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const filePath = path.join(outDir, fileName);

    const opts = {
      rows: data.records,
      startDate,
      endDate,
      outputPath: filePath
    };

    if (format === 'pdf') {
      await generateIpCensusPdf(opts);
    } else {
      await generateIpCensusExcel(opts);
    }

    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return {
      filePath,
      contentType: format === 'pdf' ? mimeTypes.pdf : mimeTypes.excel
    };
  }
}
export const reportService = new ReportService();
