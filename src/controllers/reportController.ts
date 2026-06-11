import { Request, Response, NextFunction } from 'express';
import { reportService } from '../services/reportService.js';
import { logger } from '../utils/logger.js';

export class ReportController {
  /**
   * GET /reports/credit-outstanding
   * Fetches paginated, filtered transaction outstanding credit lists.
   */
  async getCreditOutstanding(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, page, limit, search } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
      };

      logger.info(`Fetching outstanding credit report for tenant: ${filters.tenant}`);
      
      const result = await reportService.getCreditOutstandingReport(filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/credit-outstanding/export
   * Generates and streams PDF, CSV, or XLSX files to the client.
   */
  async exportReport(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, format } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
      };

      const fileType = String(format).toLowerCase() as 'csv' | 'xlsx' | 'pdf';

      logger.info(`Exporting outstanding report format ${fileType.toUpperCase()} for tenant: ${filters.tenant}`);

      const { filePath, contentType } = await reportService.exportReportFile(filters, fileType);

      res.setHeader('Content-Type', contentType);
      res.download(filePath, (err) => {
        if (err) {
          logger.error(`Error sending download stream: ${err}`);
        }
        
        // Clean up the file after streaming is complete (optional but recommended to save space)
        try {
          // fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          logger.warn(`Failed to clean temporary export file: ${unlinkErr}`);
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/day-duty
   * Fetches paginated, filtered patient day duty logs.
   */
  async getDayDuty(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, date, page, limit, search } = req.query;

      const filters = {
        tenant: String(tenant),
        date: date ? String(date) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
      };

      logger.info(`Fetching day duty report for tenant: ${filters.tenant}`);
      
      const result = await reportService.getDayDutyReport(filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/day-duty/export
   * Generates and streams PDF or Excel files to the client.
   */
  async exportDayDuty(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, date, format } = req.query;

      const filters = {
        tenant: String(tenant),
        date: date ? String(date) : undefined,
      };

      const fileType = String(format).toLowerCase() === 'pdf' ? 'pdf' : 'excel';

      logger.info(`Exporting day duty report format ${fileType.toUpperCase()} for tenant: ${filters.tenant}`);

      const { filePath, contentType } = await reportService.exportDayDutyReport(filters, fileType);

      res.setHeader('Content-Type', contentType);
      res.download(filePath, (err) => {
        if (err) {
          logger.error(`Error sending Day Duty download stream: ${err}`);
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/op-census
   * Fetches paginated, filtered specialties and counts for the OP Census report.
   */
  async getOpCensus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, page, limit, search } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
      };

      logger.info(`Fetching OP census report for tenant: ${filters.tenant} [${filters.from} to ${filters.to}]`);

      const result = await reportService.getOpCensusReport(filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/op-census/export
   * Generates and streams PDF or Excel files to the client.
   */
  async exportOpCensus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, format } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
      };

      const fileType = String(format).toLowerCase() === 'pdf' ? 'pdf' : 'excel';

      logger.info(`Exporting OP census report format ${fileType.toUpperCase()} for tenant: ${filters.tenant}`);

      const { filePath, contentType } = await reportService.exportOpCensusReport(filters, fileType);

      res.setHeader('Content-Type', contentType);
      res.download(filePath, (err) => {
        if (err) {
          logger.error(`Error sending OP Census download stream: ${err}`);
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/ip-census
   * Fetches paginated, filtered specialties and counts for the IP Census report.
   */
  async getIpCensus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, page, limit, search } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
      };

      logger.info(`Fetching IP census report for tenant: ${filters.tenant} [${filters.from} to ${filters.to}]`);

      const result = await reportService.getIpCensusReport(filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reports/ip-census/export
   * Generates and streams PDF or Excel files to the client.
   */
  async exportIpCensus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { tenant, from, to, format } = req.query;

      const filters = {
        tenant: String(tenant),
        from: String(from),
        to: String(to),
      };

      const fileType = String(format).toLowerCase() === 'pdf' ? 'pdf' : 'excel';

      logger.info(`Exporting IP census report format ${fileType.toUpperCase()} for tenant: ${filters.tenant}`);

      const { filePath, contentType } = await reportService.exportIpCensusReport(filters, fileType);

      res.setHeader('Content-Type', contentType);
      res.download(filePath, (err) => {
        if (err) {
          logger.error(`Error sending IP Census download stream: ${err}`);
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
export const reportController = new ReportController();
