import type { Writable } from 'node:stream';

import { ZipArchive } from 'archiver';

import { recordsToCsv, todayInOman } from '../../lib/csv.js';
import type { AuthUser } from '../../lib/types.js';

import { exportRepo } from './export.repo.js';

export const exportService = {
  filename: (): string => `bareeq-export-${todayInOman()}.zip`,

  /** Streams a ZIP containing one CSV (UTF-8 with BOM) per table of the user's organization. */
  async writeZip(user: AuthUser, out: Writable): Promise<void> {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      out.on('error', reject);
      out.on('close', () => resolve());
      out.on('finish', () => resolve());
    });
    archive.pipe(out);
    for await (const table of exportRepo.tables(user.orgId)) {
      archive.append(recordsToCsv(table.headers, table.rows), { name: `${table.name}.csv` });
    }
    await archive.finalize();
    await done;
  },
};
