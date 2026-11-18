import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { AppError } from '../lib/errors.js';

export interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type Out<T> = T extends z.ZodType ? z.output<T> : undefined;
export interface Validated<S extends Schemas> {
  body: Out<S['body']>;
  query: Out<S['query']>;
  params: Out<S['params']>;
}

/** Flattens Zod issues into `{ "field.path": "message key" }` (first issue per path wins). */
export function zodDetails(error: z.ZodError, prefix?: string): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : (prefix ?? '_');
    details[key] ??= issue.message;
  }
  return details;
}

/**
 * Validates `body`, `query` and `params` with Zod and stores the parsed (typed, transformed)
 * values in `res.locals.validated`. Express 5 makes `req.query` read-only, hence res.locals.
 */
export function validate<S extends Schemas>(schemas: S): RequestHandler {
  return (req, res, next) => {
    const out: Record<string, unknown> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw AppError.validation(`Invalid request ${part}`, zodDetails(result.error));
      }
      out[part] = result.data;
    }
    res.locals.validated = out;
    next();
  };
}
