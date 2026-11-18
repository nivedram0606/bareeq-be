import type {
  DashboardDto,
  FeeCollectionQuery,
  FeeCollectionReportDto,
  FeeCollectionRow,
  OutstandingQuery,
  OutstandingReportDto,
  OutstandingRow,
  StudentReportDto,
  StudentReportQuery,
  StudentReportRow,
} from '@bareeq/shared';

import { toCsv, todayInOman } from '../../lib/csv.js';
import type { CsvColumn } from '../../lib/csv.js';
import { offsetOf } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';
import { paymentsRepo } from '../payments/payments.repo.js';

import { reportsRepo } from './reports.repo.js';

const pageOf = (q: { page: number; pageSize: number }) => ({
  limit: q.pageSize,
  offset: offsetOf(q),
});

const STUDENT_COLUMNS: CsvColumn<StudentReportRow>[] = [
  { header: 'Admission No', value: (r) => r.admissionNo },
  { header: 'Name', value: (r) => r.studentName },
  { header: 'Arabic Name', value: (r) => r.nameAr },
  { header: 'Class', value: (r) => r.className },
  { header: 'Status', value: (r) => r.status },
  { header: 'Primary Guardian', value: (r) => r.primaryGuardian },
  { header: 'Phone', value: (r) => r.phone },
];

const COLLECTION_COLUMNS: CsvColumn<FeeCollectionRow>[] = [
  { header: 'Date', value: (r) => r.paidOn },
  { header: 'Admission No', value: (r) => r.admissionNo },
  { header: 'Student', value: (r) => r.studentName },
  { header: 'Class', value: (r) => r.className },
  { header: 'Fee', value: (r) => r.feeTitle },
  { header: 'Amount (OMR)', value: (r) => r.amount },
  { header: 'Method', value: (r) => r.method },
  { header: 'Reference', value: (r) => r.reference },
  { header: 'Received By', value: (r) => r.receivedBy },
];

const OUTSTANDING_COLUMNS: CsvColumn<OutstandingRow>[] = [
  { header: 'Admission No', value: (r) => r.admissionNo },
  { header: 'Student', value: (r) => r.studentName },
  { header: 'Class', value: (r) => r.className },
  { header: 'Fee', value: (r) => r.feeTitle },
  { header: 'Net Due (OMR)', value: (r) => r.netDue },
  { header: 'Paid (OMR)', value: (r) => r.paid },
  { header: 'Outstanding (OMR)', value: (r) => r.outstanding },
  { header: 'Due Date', value: (r) => r.dueDate },
];

export interface CsvFile {
  filename: string;
  content: string;
}

export const reportsService = {
  async students(user: AuthUser, q: StudentReportQuery): Promise<StudentReportDto> {
    const { rows, total } = await reportsRepo.students(user.orgId, q, pageOf(q));
    return { data: rows, page: q.page, pageSize: q.pageSize, total, totals: {} };
  },

  async studentsCsv(user: AuthUser, q: StudentReportQuery): Promise<CsvFile> {
    const { rows } = await reportsRepo.students(user.orgId, q, undefined);
    return { filename: `students-${todayInOman()}.csv`, content: toCsv(STUDENT_COLUMNS, rows) };
  },

  async feeCollection(user: AuthUser, q: FeeCollectionQuery): Promise<FeeCollectionReportDto> {
    const { rows, total, collected } = await reportsRepo.feeCollection(user.orgId, q, pageOf(q));
    return { data: rows, page: q.page, pageSize: q.pageSize, total, totals: { collected } };
  },

  async feeCollectionCsv(user: AuthUser, q: FeeCollectionQuery): Promise<CsvFile> {
    const { rows, collected } = await reportsRepo.feeCollection(user.orgId, q, undefined);
    const totalRow = { amount: collected, feeTitle: 'TOTAL' } as FeeCollectionRow;
    return {
      filename: `fee-collection-${todayInOman()}.csv`,
      content: toCsv(COLLECTION_COLUMNS, [...rows, totalRow]),
    };
  },

  async outstanding(user: AuthUser, q: OutstandingQuery): Promise<OutstandingReportDto> {
    const { rows, total, outstanding } = await reportsRepo.outstanding(user.orgId, q, pageOf(q));
    return { data: rows, page: q.page, pageSize: q.pageSize, total, totals: { outstanding } };
  },

  async outstandingCsv(user: AuthUser, q: OutstandingQuery): Promise<CsvFile> {
    const { rows, outstanding } = await reportsRepo.outstanding(user.orgId, q, undefined);
    const totalRow = { outstanding, feeTitle: 'TOTAL' } as OutstandingRow;
    return {
      filename: `outstanding-${todayInOman()}.csv`,
      content: toCsv(OUTSTANDING_COLUMNS, [...rows, totalRow]),
    };
  },

  async dashboard(user: AuthUser): Promise<DashboardDto> {
    const today = todayInOman();
    const [y, m] = today.split('-').map(Number) as [number, number];
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const month = { from: `${today.slice(0, 8)}01`, to: `${today.slice(0, 8)}${lastDay}` };
    const [totals, recentPayments] = await Promise.all([
      reportsRepo.dashboardTotals(user.orgId, month),
      paymentsRepo.recent(user.orgId, 10),
    ]);
    return { ...totals, recentPayments };
  },
};
