import type { Request, RequestHandler } from 'express';

import { idParamSchema, LOGO_MAX_BYTES, updateOrgSchema } from '@bareeq/shared';

import { AppError } from '../../lib/errors.js';
import { handle } from '../../lib/http.js';

import { orgService } from './org.service.js';

/** Multipart overhead allowance on top of the file itself. */
const MAX_UPLOAD_BYTES = LOGO_MAX_BYTES + 64 * 1024;

/** Reads the raw request body, aborting as soon as it exceeds `max` bytes. */
async function readBody(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > max) {
    throw AppError.validation('Logo must be at most 1 MB', { logo: 'validation.logo_size' });
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) {
      throw AppError.validation('Logo must be at most 1 MB', { logo: 'validation.logo_size' });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Parses a multipart/form-data body with the built-in WHATWG FormData parser. */
async function readLogoFile(req: Request): Promise<{ type: string; bytes: Uint8Array }> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw AppError.validation('Expected multipart/form-data with a "logo" file', {
      logo: 'validation.required',
    });
  }
  const body = await readBody(req, MAX_UPLOAD_BYTES);
  let form: FormData;
  try {
    form = await new Request('http://upload.local/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    }).formData();
  } catch {
    throw AppError.validation('Malformed multipart body', { logo: 'validation.required' });
  }
  const file = form.get('logo');
  if (!(file instanceof File)) {
    throw AppError.validation('A "logo" file is required', { logo: 'validation.required' });
  }
  return { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/**
 * Public: serves the school logo. Images are loaded from the web app's origin, so allow
 * cross-origin embedding; the strict CSP keeps an uploaded SVG from running scripts.
 */
const logo: RequestHandler = async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.notFound('Logo');
  const { data, mime } = await orgService.logo(params.data.id);
  res
    .set({
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    })
    .send(data);
};

export const orgController = {
  logo,

  get: handle({}, ({ user }) => orgService.get(user.orgId)),

  update: handle({ body: updateOrgSchema }, ({ user, body }) => orgService.update(user, body)),

  uploadLogo: handle({}, async ({ user }, req) =>
    orgService.uploadLogo(user, await readLogoFile(req)),
  ),
};
