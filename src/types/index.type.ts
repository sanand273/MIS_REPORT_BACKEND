import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  tenant?: string;
  userid?: string;
  hostdomain?: string;
  accesstoken?: string;
  orgId?: string;
  fullName?: string;
  roles?: string[];
  user?: {
    id: string;
    role: string;
    tenantId: string;
  };
}
