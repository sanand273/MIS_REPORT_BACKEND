import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Set default values if not an operational AppError
  let statusCode = 500;
  let message = 'An unexpected error occurred. Please try again later.';
  
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log the error details with request info
  logger.error(
    `Error details: [${req.method}] ${req.originalUrl} - Status: ${statusCode} - Message: ${err.message}`
  );

  // Print stack trace if in development and not operational
  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
