import { computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Expense, ExpenseFilters, ExpenseInput, PagedResult, SortField } from '../core/models';
import { errorMessage } from '../core/utils';
import { CategoriesStore } from './categories.store';

export const DEFAULT_FILTERS: ExpenseFilters = {
  search: '',
  categoryId: null,
  status: null,
  overdue: false,
  from: null,
  to: null,
  sortBy: 'date',
  sortDir: 'desc',
  page: 1,
  pageSize: 15,
};

interface ExpensesState {
  items: Expense[];
  total: number;
  filters: ExpenseFilters;
  loading: boolean;
  error: string | null;
}

export const ExpensesStore = signalStore(
  { providedIn: 'root' },
  withState<ExpensesState>({ items: [], total: 0, filters: DEFAULT_FILTERS, loading: false, error: null }),
  withComputed(({ total, filters, items }) => ({
    pageCount: computed(() => Math.max(1, Math.ceil(total() / filters().pageSize))),
    pageTotal: computed(() => items().reduce((sum, e) => sum + e.amount, 0)),
    hasActiveFilters: computed(() => {
      const f = filters();
      return !!(f.search || f.categoryId || f.status || f.overdue || f.from || f.to);
    }),
  })),
  withMethods((store, http = inject(HttpClient), categories = inject(CategoriesStore)) => {
    const url = '/api/expenses';
    let requestId = 0;

    async function load() {
      const id = ++requestId;
      patchState(store, { loading: true, error: null });
      let params = new HttpParams();
      for (const [key, value] of Object.entries(store.filters())) {
        if (value !== null && value !== '' && value !== false) params = params.set(key, String(value));
      }
      try {
        const res = await firstValueFrom(http.get<PagedResult<Expense>>(url, { params }));
        // Ignore responses that were superseded by a newer filter change.
        if (id === requestId) patchState(store, { items: res.items, total: res.total, loading: false });
      } catch (err) {
        if (id === requestId) patchState(store, { loading: false, error: errorMessage(err) });
      }
    }

    function updateFilters(changes: Partial<ExpenseFilters>) {
      patchState(store, { filters: { ...store.filters(), page: 1, ...changes } });
      return load();
    }

    async function afterMutation() {
      await Promise.all([load(), categories.refresh()]);
    }

    /** Returns an error message, or null on success. */
    async function save(input: ExpenseInput, id?: string): Promise<string | null> {
      try {
        await firstValueFrom(id ? http.put<Expense>(`${url}/${id}`, input) : http.post<Expense>(url, input));
        await afterMutation();
        return null;
      } catch (err) {
        return errorMessage(err);
      }
    }

    return {
      load,
      updateFilters,
      resetFilters: () => updateFilters({ ...DEFAULT_FILTERS, pageSize: store.filters().pageSize }),
      setPage: (page: number) => updateFilters({ page }),
      toggleSort(field: SortField) {
        const f = store.filters();
        const sortDir = f.sortBy === field && f.sortDir === 'desc' ? 'asc' : 'desc';
        return updateFilters({ sortBy: field, sortDir });
      },

      save,
      async remove(id: string): Promise<string | null> {
        try {
          await firstValueFrom(http.delete(`${url}/${id}`));
          await afterMutation();
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      },
      async markPaid(expense: Expense): Promise<string | null> {
        const { title, amount, date, dueDate, notes, categoryId, recurrence } = expense;
        return save({ title, amount, date, dueDate, notes, categoryId, recurrence, status: 'Paid' }, expense.id);
      },
      reset: () => patchState(store, { items: [], total: 0, filters: DEFAULT_FILTERS }),
    };
  }),
);
