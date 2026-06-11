import { Router } from 'express';
import { reportController } from '../controllers/reportController.js';
import { 
  getCreditOutstandingValidator, 
  exportReportValidator,
  getDayDutyValidator,
  exportDayDutyValidator,
  getOpCensusValidator,
  exportOpCensusValidator,
  getIpCensusValidator,
  exportIpCensusValidator
} from '../validators/reportValidator.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * @route   GET /reports/credit-outstanding
 * @desc    Fetch credit outstanding transactions
 * @access  Private (JWT Auth)
 */
router.get(
  '/credit-outstanding',
  authMiddleware as any, // Authenticates request
  getCreditOutstandingValidator, // Validates query parameters
  reportController.getCreditOutstanding
);

/**
 * @route   GET /reports/credit-outstanding/export
 * @desc    Export report as PDF, CSV, or Excel file
 * @access  Private (JWT Auth)
 */
router.get(
  '/credit-outstanding/export',
  authMiddleware as any,
  exportReportValidator,
  reportController.exportReport
);

/**
 * @route   GET /reports/day-duty
 * @desc    Fetch patient day duty logs
 * @access  Private (JWT Auth)
 */
router.get(
  '/day-duty',
  authMiddleware as any,
  getDayDutyValidator,
  reportController.getDayDuty
);

/**
 * @route   GET /reports/day-duty/export
 * @desc    Export day duty report as PDF or Excel
 * @access  Private (JWT Auth)
 */
router.get(
  '/day-duty/export',
  authMiddleware as any,
  exportDayDutyValidator,
  reportController.exportDayDuty
);

/**
 * @route   GET /reports/op-census
 * @desc    Fetch outpatient census count grouped by speciality
 * @access  Private (JWT Auth)
 */
router.get(
  '/op-census',
  authMiddleware as any,
  getOpCensusValidator,
  reportController.getOpCensus
);

/**
 * @route   GET /reports/op-census/export
 * @desc    Export OP census report as PDF or Excel
 * @access  Private (JWT Auth)
 */
router.get(
  '/op-census/export',
  authMiddleware as any,
  exportOpCensusValidator,
  reportController.exportOpCensus
);

/**
 * @route   GET /reports/ip-census
 * @desc    Fetch inpatient census count grouped by speciality
 * @access  Private (JWT Auth)
 */
router.get(
  '/ip-census',
  authMiddleware as any,
  getIpCensusValidator,
  reportController.getIpCensus
);

/**
 * @route   GET /reports/ip-census/export
 * @desc    Export IP census report as PDF or Excel
 * @access  Private (JWT Auth)
 */
router.get(
  '/ip-census/export',
  authMiddleware as any,
  exportIpCensusValidator,
  reportController.exportIpCensus
);

export default router;
