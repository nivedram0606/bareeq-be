import type { Role } from '@bareeq/shared';

export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: AuthUser;
    }
  }
}
