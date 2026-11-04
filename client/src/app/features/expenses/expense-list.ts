import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EXPENSE_STATUSES, Expense, ExpenseFilters, SortField } from '../../core/models';
import { dueLabel } from '../../core/utils';
import { CategoriesStore } from '../../state/categories.store';
import { ExpensesStore } from '../../state/expenses.store';
import { ExpenseForm } from './expense-form';

@Component({
  selector: 'app-expense-list',
  imports: [FormsModule, CurrencyPipe, DatePipe, ExpenseForm],
  styleUrl: './expense-list.scss',
  template: `
    <div class="page-header">
      <div>
        <h1>Expenses</h1>
        <p class="muted">{{ store.total() }} {{ store.total() === 1 ? 'expense' : 'expenses' }} found</p>
      </div>
      <button class="btn btn-primary" type="button" (click)="editing.set('new')">+ Add expense</button>
    </div>

    <section class="filters card" aria-label="Filters">
      <input
        class="search"
        type="search"
        placeholder="Search title or notes…"
        [ngModel]="f().search"
        (ngModelChange)="onSearch($event)"
      />
      <select [ngModel]="f().categoryId" (ngModelChange)="store.updateFilters({ categoryId: $event })" aria-label="Category">
        <option [ngValue]="null">All categories</option>
        @for (c of categories.items(); track c.id) {
          <option [ngValue]="c.id">{{ c.name }}</option>
        }
      </select>
      <select [ngModel]="f().status" (ngModelChange)="store.updateFilters({ status: $event })" aria-label="Status">
        <option [ngValue]="null">All statuses</option>
        @for (s of statuses; track s) {
          <option [ngValue]="s">{{ s }}</option>
        }
      </select>
      <label class="date-filter">
        <span>From</span>
        <input type="date" [ngModel]="f().from" (ngModelChange)="store.updateFilters({ from: $event || null })" />
      </label>
      <label class="date-filter">
        <span>To</span>
        <input type="date" [ngModel]="f().to" (ngModelChange)="store.updateFilters({ to: $event || null })" />
      </label>
      <select [ngModel]="sortKey()" (ngModelChange)="onSortSelect($event)" aria-label="Sort by">
        @for (o of sortOptions; track o.value) {
          <option [value]="o.value">{{ o.label }}</option>
        }
      </select>
      <label class="toggle">
        <input type="checkbox" [ngModel]="f().overdue" (ngModelChange)="store.updateFilters({ overdue: $event })" />
        Overdue only
      </label>
      @if (store.hasActiveFilters()) {
        <button class="btn btn-ghost btn-sm" type="button" (click)="store.resetFilters()">Clear filters</button>
      }
    </section>

    @if (store.error(); as error) {
      <div class="alert alert-error" role="alert">{{ error }} <button class="btn btn-sm btn-ghost" (click)="store.load()">Retry</button></div>
    }
    @if (actionError(); as error) {
      <div class="alert alert-error" role="alert">{{ error }}</div>
    }

    <section class="card table-card" [class.loading]="store.loading()">
      @if (store.items().length) {
        <table class="expense-table">
          <thead>
            <tr>
              @for (col of columns; track col.field) {
                <th [class.num]="col.field === 'amount'">
                  <button type="button" class="sort" (click)="store.toggleSort(col.field)">
                    {{ col.label }}
                    @if (f().sortBy === col.field) {
                      <span aria-hidden="true">{{ f().sortDir === 'asc' ? '▲' : '▼' }}</span>
                    }
                  </button>
                </th>
              }
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (e of store.items(); track e.id) {
              <tr [class.overdue]="e.isOverdue">
                <td class="title-cell">
                  <strong>{{ e.title }}</strong>
                  @if (e.recurrence !== 'None') {
                    <span class="repeat-tag" [title]="'Repeats ' + e.recurrence.toLowerCase()">↻ {{ e.recurrence }}</span>
                  }
                  @if (e.notes) {
                    <small class="muted notes">{{ e.notes }}</small>
                  }
                </td>
                <td data-label="Category">
                  @if (e.categoryName) {
                    <span class="chip" [style.--chip]="e.categoryColor">{{ e.categoryName }}</span>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td data-label="Date">{{ e.date | date: 'mediumDate' }}</td>
                <td data-label="Due">
                  @if (e.dueDate) {
                    <div>{{ e.dueDate | date: 'mediumDate' }}</div>
                    @if (e.status === 'Pending') {
                      <small [class]="e.isOverdue ? 'due-text overdue' : 'due-text'">{{ dueLabel(e.dueDate) }}</small>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td data-label="Status">
                  <span class="badge" [class]="'badge badge-' + (e.isOverdue ? 'overdue' : e.status.toLowerCase())">
                    {{ e.isOverdue ? 'Overdue' : e.status }}
                  </span>
                </td>
                <td class="num amount" data-label="Amount">{{ e.amount | currency }}</td>
                <td class="actions">
                  @if (e.status === 'Pending') {
                    <button class="btn btn-ghost btn-sm" type="button" (click)="markPaid(e)" title="Mark as paid">✓ Paid</button>
                  }
                  <button class="btn btn-ghost btn-sm" type="button" (click)="editing.set(e)">Edit</button>
                  <button class="btn btn-ghost btn-sm danger" type="button" (click)="deleting.set(e)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>

        <footer class="table-footer">
          <span class="muted">Page total: <strong>{{ store.pageTotal() | currency }}</strong></span>
          <div class="pager">
            <button class="btn btn-ghost btn-sm" type="button" [disabled]="f().page <= 1" (click)="store.setPage(f().page - 1)">‹ Prev</button>
            <span>Page {{ f().page }} of {{ store.pageCount() }}</span>
            <button class="btn btn-ghost btn-sm" type="button" [disabled]="f().page >= store.pageCount()" (click)="store.setPage(f().page + 1)">Next ›</button>
          </div>
        </footer>
      } @else if (!store.loading()) {
        <div class="empty">
          <p>{{ store.hasActiveFilters() ? 'No expenses match these filters.' : 'No expenses yet.' }}</p>
          @if (!store.hasActiveFilters()) {
            <button class="btn btn-primary" type="button" (click)="editing.set('new')">Add your first expense</button>
          }
        </div>
      } @else {
        <div class="empty muted">Loading…</div>
      }
    </section>

    @if (editing(); as current) {
      <app-expense-form [expense]="current === 'new' ? null : current" (closed)="editing.set(null)" />
    }

    @if (deleting(); as target) {
      <div class="modal-backdrop" (click)="deleting.set(null)"></div>
      <div class="modal modal-sm card" role="alertdialog" aria-modal="true">
        <h2>Delete expense?</h2>
        <p>"{{ target.title }}" ({{ target.amount | currency }}) will be permanently removed.</p>
        <footer class="modal-footer">
          <button class="btn btn-ghost" type="button" (click)="deleting.set(null)">Cancel</button>
          <button class="btn btn-danger" type="button" (click)="confirmDelete(target)">Delete</button>
        </footer>
      </div>
    }
  `,
})
export class ExpenseListPage implements OnInit, OnDestroy {
  protected readonly store = inject(ExpensesStore);
  protected readonly categories = inject(CategoriesStore);
  private readonly router = inject(Router);
  /** Bound from the ?overdue=true query param (dashboard link). */
  readonly overdue = input<string>();

  protected readonly statuses = EXPENSE_STATUSES;
  protected readonly f = this.store.filters;
  protected readonly dueLabel = dueLabel;
  protected readonly editing = signal<Expense | 'new' | null>(null);
  protected readonly deleting = signal<Expense | null>(null);
  protected readonly actionError = signal<string | null>(null);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly columns: { field: SortField; label: string }[] = [
    { field: 'title', label: 'Title' },
    { field: 'category', label: 'Category' },
    { field: 'date', label: 'Date' },
    { field: 'dueDate', label: 'Due' },
    { field: 'status', label: 'Status' },
    { field: 'amount', label: 'Amount' },
  ];

  protected readonly sortOptions = [
    { value: 'date:desc', label: 'Newest first' },
    { value: 'date:asc', label: 'Oldest first' },
    { value: 'amount:desc', label: 'Amount: high → low' },
    { value: 'amount:asc', label: 'Amount: low → high' },
    { value: 'dueDate:asc', label: 'Due date: soonest' },
    { value: 'dueDate:desc', label: 'Due date: latest' },
    { value: 'title:asc', label: 'Title A → Z' },
    { value: 'category:asc', label: 'Category' },
    { value: 'status:asc', label: 'Status' },
  ];

  ngOnInit() {
    if (this.overdue() === 'true') {
      this.store.updateFilters({ overdue: true });
      // The param is a one-shot shortcut; the store owns filter state from here on.
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    } else {
      this.store.load();
    }
  }

  ngOnDestroy() {
    clearTimeout(this.searchTimer);
  }

  protected sortKey() {
    return `${this.f().sortBy}:${this.f().sortDir}`;
  }

  protected onSortSelect(value: string) {
    const [sortBy, sortDir] = value.split(':') as [SortField, ExpenseFilters['sortDir']];
    this.store.updateFilters({ sortBy, sortDir });
  }

  protected onSearch(search: string) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.updateFilters({ search }), 300);
  }

  protected async markPaid(e: Expense) {
    this.actionError.set(await this.store.markPaid(e));
  }

  protected async confirmDelete(e: Expense) {
    this.deleting.set(null);
    this.actionError.set(await this.store.remove(e.id));
  }
}
