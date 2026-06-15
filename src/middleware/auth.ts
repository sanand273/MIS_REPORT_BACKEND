import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthenticatedRequest } from '../types/index.type.js';

// Environment variables (configure these in your environment)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || '';

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {


  try {
    const authHeader = req.headers.authorization;

    // Check for Bearer token
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const accessToken = authHeader.split(' ')[1];

    // Validate token with auth service
    try {
      const response = await axios.get(AUTH_SERVICE_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      // Check if token is valid
      if (!response.data?.valid) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      // Attach user payload to request
      req.tenant = response.data.payload.tenantkey;
      req.userid = response.data.payload.userid;
      req.hostdomain = response.data.payload.hostdomain;
      req.accesstoken = accessToken;
      req.fullName = response.data.payload.fullName;
      req.orgId = response.data.payload.orgId;
      req.roles = Array.isArray(response.data.payload.roles) ? response.data.payload.roles : [];

      // Support fallback fields for user context if expected elsewhere
      req.user = {
        id: response.data.payload.userid || '',
        role: Array.isArray(response.data.payload.roles) && response.data.payload.roles.length > 0 ? response.data.payload.roles[0] : 'user',
        tenantId: response.data.payload.tenantkey || '',
      };

      return next();
    } catch (authError) {
      if (axios.isAxiosError(authError)) {
        if (authError.response?.status === 401) {
          res.status(401).json({ error: 'Invalid or expired token' });
          return;
        }
        console.error('Auth service error:', authError.message);
        res.status(502).json({ error: 'Authentication service unavailable' });
        return;
      }
      throw authError;
    }
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Failed to authorize user' });
  }
}
