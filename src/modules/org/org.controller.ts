import type { Request } from 'express';

import { LOGO_MAX_BYTES, updateOrgSchema } from '@bareeq/shared';

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

export const orgController = {
  get: handle({}, ({ user }) => orgService.get(user.orgId)),

  update: handle({ body: updateOrgSchema }, ({ user, body }) => orgService.update(user, body)),

  uploadLogo: handle({}, async ({ user }, req) =>
    orgService.uploadLogo(user, await readLogoFile(req)),
  ),
};
