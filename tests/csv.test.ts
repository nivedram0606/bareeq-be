import { describe, expect, it } from 'vitest';

import { BOM, recordsToCsv, safeCell, toCsv } from '../src/lib/csv.js';

describe('csv', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string; amount: string }) => r.name },
    { header: 'Amount', value: (r: { name: string; amount: string }) => r.amount },
  ];

  it('starts with a UTF-8 BOM and uses CRLF line endings', () => {
    const csv = toCsv(columns, [{ name: 'Ali', amount: '1.000' }]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Name,Amount\r\nAli,1.000\r\n');
  });

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv(columns, [{ name: 'Al-Harthi, "Sara"\nGrade 2', amount: '5.500' }]);
    expect(csv.slice(1)).toBe('Name,Amount\r\n"Al-Harthi, ""Sara""\nGrade 2",5.500\r\n');
  });

  it('keeps Arabic text intact', () => {
    const csv = toCsv(columns, [{ name: 'فاطمة الحارثي', amount: '0.000' }]);
    expect(csv).toContain('فاطمة الحارثي');
  });

  it('neutralises formula injection but leaves negative numbers alone', () => {
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell('+123abc')).toBe(`'+123abc`);
    expect(safeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(safeCell('-4.500')).toBe('-4.500');
    expect(safeCell(null)).toBe('');
  });

  it('serialises dates and JSON in record exports', () => {
    const csv = recordsToCsv(
      ['id', 'at', 'diff'],
      [{ id: 1, at: new Date('2026-01-02T03:04:05Z'), diff: { a: 1 } }],
    );
    expect(csv.slice(1)).toBe('id,at,diff\r\n1,2026-01-02T03:04:05.000Z,"{""a"":1}"\r\n');
  });
});
