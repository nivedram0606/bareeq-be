import type { z } from 'zod';

import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@bareeq/shared';
import type { BrandingDto, Locale, OrgDto, updateOrgSchema } from '@bareeq/shared';

import { db } from '../../db/client.js';
import { diffOf, writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../lib/types.js';

import { orgRepo } from './org.repo.js';
import type { OrgRow } from './org.repo.js';

type LogoMime = (typeof LOGO_MIME_TYPES)[number];
const EXTENSIONS: Record<LogoMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

export const toOrgDto = (r: OrgRow): OrgDto => ({
  id: r.id,
  name: r.name,
  nameAr: r.nameAr,
  currency: r.currency,
  defaultLocale: r.defaultLocale as Locale,
  brandColor: r.brandColor,
  logoPath: r.logoPath,
  // Relative to the API base URL; the file name changes per upload, so it doubles as a cache key.
  logoUrl:
    r.logoPath && r.logoMime ? `/orgs/${r.id}/logo?v=${encodeURIComponent(r.logoPath)}` : null,
});

/** Checks the file's leading bytes match its declared type (don't trust the client MIME). */
function matchesSignature(type: LogoMime, bytes: Uint8Array): boolean {
  switch (type) {
    case 'image/png':
      return [0x89, 0x50, 0x4e, 0x47].every((b, i) => bytes[i] === b);
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/svg+xml': {
      const head = new TextDecoder().decode(bytes.slice(0, 1024)).toLowerCase();
      return head.includes('<svg');
    }
  }
}

export const orgService = {
  /** Public branding (name, logo, colour) for the login page; no sensitive fields. */
  async branding(): Promise<BrandingDto> {
    const org = await orgRepo.findPrimary();
    if (!org) throw AppError.notFound('Organization');
    const { name, nameAr, defaultLocale, brandColor, logoUrl } = toOrgDto(org);
    return { name, nameAr, defaultLocale, brandColor, logoUrl };
  },

  /** Public logo bytes for `GET /orgs/:id/logo`. */
  async logo(orgId: string): Promise<{ data: Buffer; mime: string }> {
    const logo = await orgRepo.logo(orgId);
    if (!logo) throw AppError.notFound('Logo');
    return logo;
  },

  async get(orgId: string): Promise<OrgDto> {
    const org = await orgRepo.findById(orgId);
    if (!org) throw AppError.notFound('Organization');
    return toOrgDto(org);
  },

  async update(user: AuthUser, input: z.output<typeof updateOrgSchema>): Promise<OrgDto> {
    return db.transaction(async (tx) => {
      const before = await orgRepo.findById(user.orgId, tx);
      if (!before) throw AppError.notFound('Organization');
      const after = await orgRepo.update(tx, user.orgId, input);
      if (!after) throw AppError.notFound('Organization');
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'organization',
        entityId: user.orgId,
        action: 'update',
        diff: diffOf(before, input),
      });
      return toOrgDto(after);
    });
  },

  async uploadLogo(user: AuthUser, file: { type: string; bytes: Uint8Array }): Promise<OrgDto> {
    const type = file.type as LogoMime;
    if (!LOGO_MIME_TYPES.includes(type)) {
      throw AppError.validation('Logo must be a PNG, JPG or SVG image', {
        logo: 'validation.logo_type',
      });
    }
    if (file.bytes.byteLength === 0 || file.bytes.byteLength > LOGO_MAX_BYTES) {
      throw AppError.validation('Logo must be at most 1 MB', { logo: 'validation.logo_size' });
    }
    if (!matchesSignature(type, file.bytes)) {
      throw AppError.validation('File content does not match its type', {
        logo: 'validation.logo_type',
      });
    }

    const before = await orgRepo.findById(user.orgId);
    if (!before) throw AppError.notFound('Organization');

    const path = `logo-${Date.now()}.${EXTENSIONS[type]}`;
    const after = await db.transaction(async (tx) => {
      const row = await orgRepo.update(tx, user.orgId, {
        logoPath: path,
        logoMime: type,
        logoData: Buffer.from(file.bytes),
      });
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'organization',
        entityId: user.orgId,
        action: 'update',
        diff: { logoPath: { from: before.logoPath, to: path } },
      });
      return row;
    });
    if (!after) throw AppError.notFound('Organization');
    return toOrgDto(after);
  },
};
