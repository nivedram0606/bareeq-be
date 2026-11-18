import type { ErrorCode } from '@bareeq/shared';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

/** An expected error that maps directly onto the API error envelope. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }

  static validation(message: string, details?: Record<string, string>): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }
  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(entity = 'Resource'): AppError {
    return new AppError('NOT_FOUND', `${entity} not found`);
  }
  static conflict(message: string, details?: Record<string, string>): AppError {
    return new AppError('CONFLICT', message, details);
  }
}

/** Postgres error fields we care about; Drizzle wraps driver errors in `cause`. */
export interface PgErrorLike {
  code: string;
  constraint_name?: string;
  detail?: string;
}

export function findPgError(err: unknown): PgErrorLike | undefined {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (
      typeof cur === 'object' &&
      'code' in cur &&
      typeof cur.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(cur.code)
    ) {
      return cur as PgErrorLike;
    }
    cur = typeof cur === 'object' && 'cause' in cur ? cur.cause : undefined;
  }
  return undefined;
}
