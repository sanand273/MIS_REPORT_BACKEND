import { query } from 'express-validator';
import { validateRequest } from '../middleware/validate.js';

export const getCreditOutstandingValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .withMessage('tenant must be a string')
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
    
  query('search')
    .optional()
    .isString()
    .trim()
    .escape(),
    
  validateRequest,
];

export const exportReportValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('format')
    .notEmpty()
    .withMessage('export format is required')
    .isIn(['csv', 'xlsx', 'pdf'])
    .withMessage('format must be one of: csv, xlsx, pdf'),
    
  validateRequest,
];

export const getDayDutyValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .trim()
    .escape(),
    
  query('date')
    .optional()
    .isDate()
    .withMessage('date must be a valid date (YYYY-MM-DD)'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
    
  query('search')
    .optional()
    .isString()
    .trim()
    .escape(),
    
  validateRequest,
];

export const exportDayDutyValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .trim()
    .escape(),
    
  query('date')
    .optional()
    .isDate()
    .withMessage('date must be a valid date (YYYY-MM-DD)'),
    
  query('format')
    .notEmpty()
    .withMessage('export format is required')
    .isIn(['excel', 'pdf'])
    .withMessage('format must be one of: excel, pdf'),
    
  validateRequest,
];

export const getOpCensusValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .withMessage('tenant must be a string')
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
    
  query('search')
    .optional()
    .isString()
    .trim()
    .escape(),
    
  validateRequest,
];

export const exportOpCensusValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('format')
    .notEmpty()
    .withMessage('export format is required')
    .isIn(['excel', 'pdf'])
    .withMessage('format must be one of: excel, pdf'),
    
  validateRequest,
];

export const getIpCensusValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .withMessage('tenant must be a string')
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
    
  query('search')
    .optional()
    .isString()
    .trim()
    .escape(),
    
  validateRequest,
];

export const exportIpCensusValidator = [
  query('tenant')
    .notEmpty()
    .withMessage('tenant identifier is required')
    .isString()
    .trim()
    .escape(),
    
  query('from')
    .notEmpty()
    .withMessage('from date is required')
    .isDate()
    .withMessage('from date must be a valid date (YYYY-MM-DD)'),
    
  query('to')
    .notEmpty()
    .withMessage('to date is required')
    .isDate()
    .withMessage('to date must be a valid date (YYYY-MM-DD)'),
    
  query('format')
    .notEmpty()
    .withMessage('export format is required')
    .isIn(['excel', 'pdf'])
    .withMessage('format must be one of: excel, pdf'),
    
  validateRequest,
];
