export type ExpenseStatus = 'Pending' | 'Paid' | 'Cancelled';
export const EXPENSE_STATUSES: ExpenseStatus[] = ['Pending', 'Paid', 'Cancelled'];

export type Recurrence = 'None' | 'Monthly' | 'Yearly';
export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: 'None', label: 'One-time' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Yearly', label: 'Yearly' },
];

export type PayFrequency = 'Weekly' | 'Biweekly' | 'Monthly' | 'Yearly';
export const PAY_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Biweekly', label: 'Every two weeks' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Yearly', label: 'Yearly' },
];

export interface Finances {
  balance: number | null;
  balanceUpdatedAt: string | null;
  /** Recurring income converted to a per-month amount. */
  monthlyIncome: number;
  nextPay: { title: string; amount: number; date: string } | null;
  /** The most recent balance change. */
  lastChange: BalanceEntry | null;
}

export type BalanceEntryKind = 'Manual' | 'Income' | 'IncomeReversed' | 'ExpensePaid' | 'ExpenseReturned' | 'ExpenseAdjusted';

/** One change to the balance, with a note saying where it came from. */
export interface BalanceEntry {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: BalanceEntryKind;
  description: string;
  createdAt: string;
}

export interface IncomeSource {
  id: string;
  title: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDate: string;
  monthlyAmount: number;
}

export interface IncomePayment {
  id: string;
  title: string;
  amount: number;
  date: string;
  received: boolean;
  oneTime: boolean;
  incomeSourceId: string | null;
}

export interface IncomeOverview {
  sources: IncomeSource[];
  scheduled: IncomePayment[];
  received: IncomePayment[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  expenseCount: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string; // yyyy-MM-dd
  dueDate: string | null;
  status: ExpenseStatus;
  recurrence: Recurrence;
  isOverdue: boolean;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  title: string;
  amount: number;
  date: string;
  dueDate: string | null;
  status: ExpenseStatus;
  recurrence: Recurrence;
  notes: string | null;
  categoryId: string | null;
}

export type SortField = 'date' | 'amount' | 'title' | 'dueDate' | 'status' | 'category';
export type SortDir = 'asc' | 'desc';

export interface ExpenseFilters {
  search: string;
  categoryId: string | null;
  status: ExpenseStatus | null;
  overdue: boolean;
  from: string | null;
  to: string | null;
  sortBy: SortField;
  sortDir: SortDir;
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DueTotal {
  count: number;
  total: number;
}

export interface StatsSummary {
  averageMonthly: number;
  averageFrom: string;
  averageTo: string;
  pendingThisMonth: DueTotal;
  dueThisWeek: DueTotal;
  dueNextMonth: DueTotal;
  byCategory: { categoryId: string | null; name: string; color: string; total: number }[];
  /** Only days with spending; yyyy-MM-dd. Paid by expense date, pending by due date. */
  byDay: { date: string; paid: number; pending: number }[];
  byStatus: { status: ExpenseStatus; count: number; total: number }[];
}
