import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import type { ApiErrorBody } from '@bareeq/shared';

import { AppError, findPgError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

import { zodDetails } from './validate.js';

function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return AppError.validation('Invalid input', zodDetails(err));

  // body-parser errors (malformed JSON, payload too large)
  if (typeof err === 'object' && err !== null && 'type' in err) {
    if (err.type === 'entity.parse.failed') return AppError.validation('Malformed JSON body');
    if (err.type === 'entity.too.large') return AppError.validation('Request body too large');
  }

  const pg = findPgError(err);
  if (pg) {
    switch (pg.code) {
      case '23505': // unique_violation
        return AppError.conflict('A record with these values already exists', {
          constraint: pg.constraint_name ?? 'unique',
        });
      case '23503': // foreign_key_violation
        return AppError.conflict('The record is referenced by, or references, missing data', {
          constraint: pg.constraint_name ?? 'foreign_key',
        });
      case '23514': // check_violation
        return AppError.validation('A value is out of the allowed range', {
          constraint: pg.constraint_name ?? 'check',
        });
      case '22P02': // invalid_text_representation (e.g. malformed uuid)
        return AppError.validation('Malformed identifier');
    }
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const appError = toAppError(err);
  if (!appError) {
    (req.log ?? logger).error({ err }, 'Unhandled error');
  }
  const e = appError ?? new AppError('INTERNAL', 'Internal server error');
  const body: ApiErrorBody = {
    error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
  };
  res.status(e.status).json(body);
};
