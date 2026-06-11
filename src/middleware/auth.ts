import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    tenantId: string;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Bypass validation in development environment for standalone sandbox testing
  if (process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'dev-user-id',
      role: 'admin',
      tenantId: (req.headers['x-tenant-id'] as string) || '1ea40969-112e-11f0-891d-028579933a83',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Access token is missing or invalid'));
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'supersecret_key_for_ecare360_mis_reports_jwt';

  try {
    const decoded = jwt.verify(token, secret) as AuthenticatedRequest['user'];
    req.user = decoded;
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}
