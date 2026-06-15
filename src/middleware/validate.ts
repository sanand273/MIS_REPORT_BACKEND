import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { BadRequestError } from '../utils/errors.js';

/**
 * Middleware that checks validation results.
 * If errors are found, it triggers a BadRequestError with error details.
 */
export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMsg = errors
      .array()
      .map((err) => `${err.type === 'field' ? err.path : 'param'}: ${err.msg}`)
      .join(', ');
      
    return next(new BadRequestError(`Validation failed: ${errorMsg}`));
  }
  
  next();
}
