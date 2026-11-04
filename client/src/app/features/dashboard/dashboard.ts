import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChartConfiguration } from 'chart.js';
import { AuthStore } from '../../core/auth/auth.store';
import { Expense, Finances, PagedResult, StatsSummary } from '../../core/models';
import { dueLabel, errorMessage, toIsoDate } from '../../core/utils';
import { PreferencesStore } from '../../core/preferences.store';
import { ExpensesStore } from '../../state/expenses.store';
import { ChartComponent } from '../../shared/chart';
import { PIE_LABEL_PADDING, PieLabelOptions, pieLabelsPlugin } from '../../shared/pie-labels';
import { ExpenseForm } from '../expenses/expense-form';
import { BalanceForm } from './balance-form';
import { RouterLink } from '@angular/router';
import { RANGES, RangeKey, buildBuckets, chartTitle, rangeBounds } from './spending-periods';

type DueTab = 'month' | 'next' | 'year';

const DUE_TABS: { key: DueTab; label: string; empty: string }[] = [
  { key: 'month', label: 'This month', empty: 'Nothing else due this month.' },
  { key: 'next', label: 'Next month', empty: 'Nothing due next month.' },
  { key: 'year', label: 'Rest of year', empty: 'Nothing due for the rest of the year.' },
];

/** Due-date window for each Upcoming tab. "This month" and "Rest of year" start today. */
function dueWindow(tab: DueTab, now = new Date()): { dueFrom: string; dueTo: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (tab === 'next') return { dueFrom: toIsoDate(new Date(y, m + 1, 1)), dueTo: toIsoDate(new Date(y, m + 2, 0)) };
  const end = tab === 'month' ? new Date(y, m + 1, 0) : new Date(y, 11, 31);
  return { dueFrom: toIsoDate(now), dueTo: toIsoDate(end) };
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const money = (v: number) => v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const sum = (items: { amount?: number; total?: number }[]) => items.reduce((acc, e) => acc + (e.amount ?? e.total ?? 0), 0);

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, NgTemplateOutlet, ChartComponent, ExpenseForm, BalanceForm, RouterLink],
  styleUrl: './dashboard.scss',
  template: `
    <div class="page-header">
      <div>
        <h1>Hi, {{ firstName() }}</h1>
        <p class="muted">Here's where your money is going.</p>
      </div>
      <button class="btn btn-primary" type="button" (click)="adding.set(true)">+ Add expense</button>
    </div>

    <section class="card balance-card" [class.loading]="finances.isLoading()">
      @if (finances.value(); as f) {
        <div class="balance-main">
          <span class="stat-label">Current balance</span>
          @if (f.balance !== null) {
            <span class="balance-value" [class.negative]="f.balance < 0">{{ f.balance | currency }}</span>
            @if (f.lastChange; as last) {
              <small class="last-change" [title]="last.description">
                <span [class.positive]="last.amount > 0" [class.negative]="last.amount < 0">
                  {{ last.amount > 0 ? '+' : '−' }}{{ abs(last.amount) | currency }}
                </span>
                {{ last.description }}
              </small>
            }
            <a class="muted small-link" routerLink="/activity">View activity →</a>
          } @else {
            <span class="balance-value muted">—</span>
            <small class="muted">Add your balance to see what's left after bills.</small>
          }
        </div>

        <div class="balance-detail">
          <span class="stat-label">After bills due by {{ dates().endOfMonth | date: 'MMM d' }}</span>
          @if (afterBills(); as left) {
            <span class="detail-value" [class.negative]="left.amount < 0">{{ left.amount | currency }}</span>
            <small class="muted">{{ left.owed | currency }} pending{{ overdueTotal() ? ', incl. overdue' : '' }}</small>
          } @else {
            <span class="detail-value muted">—</span>
          }
        </div>

        <div class="balance-detail">
          <span class="stat-label">Next pay</span>
          @if (f.nextPay; as next) {
            <span class="detail-value positive">+{{ next.amount | currency }}</span>
            <small class="muted">{{ next.title }} · {{ next.date | date: 'EEE, MMM d' }}</small>
          } @else {
            <span class="detail-value muted">—</span>
            <a class="muted small-link" routerLink="/income">Add your income →</a>
          }
        </div>

        <div class="balance-detail">
          <span class="stat-label">Monthly income</span>
          @if (f.monthlyIncome > 0) {
            <span class="detail-value">{{ f.monthlyIncome | currency }}</span>
            @if (stats.value(); as s) {
              <small class="muted">
                {{ f.monthlyIncome - s.averageMonthly >= 0 ? '+' : '−' }}{{ abs(f.monthlyIncome - s.averageMonthly) | currency }} vs. avg. spending
              </small>
            }
          } @else {
            <span class="detail-value muted">—</span>
          }
        </div>

        <div class="balance-actions">
          <button class="btn btn-ghost btn-outline" type="button" (click)="editingFinances.set(true)">
            {{ f.balance === null ? 'Add balance' : 'Update balance' }}
          </button>
          <a class="btn btn-ghost btn-sm" routerLink="/income">Manage income</a>
        </div>
      } @else if (finances.error()) {
        <span class="muted">Couldn't load your balance.</span>
        <button class="btn btn-sm btn-ghost" (click)="finances.reload()">Retry</button>
      }
    </section>

    <div class="tabs range-tabs" role="tablist">
      @for (r of ranges; track r.key) {
        <button type="button" role="tab" [class.active]="range() === r.key" [attr.aria-selected]="range() === r.key" (click)="range.set(r.key)">
          {{ r.label }}
        </button>
      }
    </div>

    @if (stats.error()) {
      <div class="alert alert-error" role="alert">
        {{ errorText() }} <button class="btn btn-sm btn-ghost" (click)="stats.reload()">Retry</button>
      </div>
    }
    @if (actionError(); as error) {
      <div class="alert alert-error" role="alert">{{ error }}</div>
    }

    @if (stats.value(); as s) {
      <section class="stat-grid" [class.loading]="stats.isLoading()">
        <div class="stat card">
          <span class="stat-label">Avg. monthly spending</span>
          <span class="stat-value">{{ s.averageMonthly | currency }}</span>
          <span class="stat-sub muted">{{ s.averageFrom | date: 'MMM' }} – {{ s.averageTo | date: 'MMM y' }}</span>
        </div>
        <div class="stat card">
          <span class="stat-label">Pending this month</span>
          <span class="stat-value">{{ s.pendingThisMonth.total | currency }}</span>
          <span class="stat-sub muted">{{ bills(s.pendingThisMonth.count) }} due by {{ dates().endOfMonth | date: 'MMM d' }}</span>
        </div>
        <div class="stat card" [class.warn]="s.dueThisWeek.count > 0">
          <span class="stat-label">Due this week</span>
          <span class="stat-value">{{ s.dueThisWeek.total | currency }}</span>
          <span class="stat-sub muted">{{ bills(s.dueThisWeek.count) }} through {{ dates().endOfWeek | date: 'EEE, MMM d' }}</span>
        </div>
        <div class="stat card">
          <span class="stat-label">Due next month</span>
          <span class="stat-value">{{ s.dueNextMonth.total | currency }}</span>
          <span class="stat-sub muted">{{ bills(s.dueNextMonth.count) }} in {{ dates().nextMonth | date: 'MMMM' }}</span>
        </div>
      </section>

      <section class="chart-grid">
        <div class="card chart-card wide">
          <div class="card-header">
            <h2>{{ spendingTitle() }}</h2>
            <span class="muted period">{{ periodLabel() }}</span>
          </div>
          <app-chart [config]="spendingChart()" />
        </div>
        <div class="card chart-card">
          <h2>By category</h2>
          @if (s.byCategory.length) {
            <app-chart class="pie" [config]="categoryChart()" />
          } @else {
            <p class="muted empty">No spending in this period.</p>
          }
        </div>
        <div class="card chart-card">
          <h2>By status</h2>
          @if (s.byStatus.length) {
            <app-chart class="pie" [config]="statusChart()" />
          } @else {
            <p class="muted empty">No expenses in this period.</p>
          }
        </div>
      </section>
    } @else if (stats.isLoading()) {
      <p class="muted">Loading dashboard…</p>
    }

    <section class="chart-grid due-grid">
      <div class="card chart-card due-card">
        <div class="card-header">
          <h2>Upcoming</h2>
          @if (upcoming.value(); as u) {
            <span class="muted">{{ u.total }} {{ u.total === 1 ? 'bill' : 'bills' }} · {{ upcomingTotal() | currency }}</span>
          }
        </div>
        <div class="tabs small" role="tablist">
          @for (t of dueTabs; track t.key) {
            <button type="button" role="tab" [class.active]="dueTab() === t.key" [attr.aria-selected]="dueTab() === t.key" (click)="dueTab.set(t.key)">
              {{ t.label }}
            </button>
          }
        </div>
        <div class="due-list" [class.loading]="upcoming.isLoading()">
          @for (e of upcoming.value()?.items ?? []; track e.id) {
            <ng-container *ngTemplateOutlet="dueRow; context: { $implicit: e }" />
          } @empty {
            @if (!upcoming.isLoading()) {
              <p class="muted empty">{{ dueTabEmpty() }}</p>
            }
          }
        </div>
      </div>

      <div class="card chart-card due-card" [class.has-overdue]="overdue.value()?.total">
        <div class="card-header">
          <h2>Overdue</h2>
          @if (overdue.value(); as o) {
            <span [class.overdue-total]="o.total" [class.muted]="!o.total">
              {{ o.total }} {{ o.total === 1 ? 'bill' : 'bills' }} · {{ overdueTotal() | currency }}
            </span>
          }
        </div>
        <div class="due-list" [class.loading]="overdue.isLoading()">
          @for (e of overdue.value()?.items ?? []; track e.id) {
            <ng-container *ngTemplateOutlet="dueRow; context: { $implicit: e }" />
          } @empty {
            @if (!overdue.isLoading()) {
              <p class="muted empty">Nothing overdue. 🎉</p>
            }
          }
        </div>
      </div>
    </section>

    <ng-template #dueRow let-e>
      <div class="due-row" [class.overdue]="e.isOverdue">
        <span class="dot" [style.background]="e.categoryColor ?? '#94a3b8'"></span>
        <div class="due-info">
          <strong>{{ e.title }}@if (e.recurrence !== 'None') { <span class="repeat">↻</span> }</strong>
          <small>{{ e.dueDate | date: 'mediumDate' }} · {{ dueLabel(e.dueDate) }}</small>
        </div>
        <span class="due-amount">{{ e.amount | currency }}</span>
        <button class="btn btn-ghost btn-sm" type="button" (click)="markPaid(e)" title="Mark as paid">✓ Paid</button>
      </div>
    </ng-template>

    @if (editingFinances()) {
      <app-balance-form [balance]="finances.value()?.balance ?? null" (closed)="onFinancesClosed($event)" />
    }

    @if (adding()) {
      <app-expense-form (closed)="onFormClosed($event)" />
    }
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthStore);
  private readonly expenses = inject(ExpensesStore);

  protected readonly ranges = RANGES;
  protected readonly dueTabs = DUE_TABS;
  private readonly preferences = inject(PreferencesStore);
  protected readonly range = signal<RangeKey>(this.preferences.dashboardRange());
  protected readonly dueTab = signal<DueTab>('month');
  protected readonly adding = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly dueLabel = dueLabel;

  private readonly bounds = computed(() => rangeBounds(this.range()));

  protected readonly stats = httpResource<StatsSummary>(() => {
    const { from, to } = this.bounds();
    return { url: '/api/stats/summary', params: { from: toIsoDate(from), to: toIsoDate(to) } };
  });

  protected readonly upcoming = httpResource<PagedResult<Expense>>(() => ({
    url: '/api/expenses',
    params: { status: 'Pending', ...dueWindow(this.dueTab()), sortBy: 'dueDate', sortDir: 'asc', pageSize: 100 },
  }));

  protected readonly overdue = httpResource<PagedResult<Expense>>(() => ({
    url: '/api/expenses',
    params: { overdue: true, sortBy: 'dueDate', sortDir: 'asc', pageSize: 100 },
  }));

  /** Dates the summary cards refer to; the API computes the matching windows the same way. */
  protected readonly dates = computed(() => {
    const now = new Date();
    return {
      endOfWeek: new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - ((now.getDay() + 6) % 7))),
      endOfMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      nextMonth: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  });

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(' ')[0] ?? 'there');
  protected readonly errorText = computed(() => errorMessage(this.stats.error()));
  protected readonly spendingTitle = computed(() => chartTitle(this.range()));
  protected readonly upcomingTotal = computed(() => sum(this.upcoming.value()?.items ?? []));
  protected readonly overdueTotal = computed(() => sum(this.overdue.value()?.items ?? []));

  protected readonly finances = httpResource<Finances>(() => '/api/finances');
  protected readonly editingFinances = signal(false);
  protected readonly abs = Math.abs;

  /** Balance minus everything still owed this month (pending bills due by month end, plus overdue ones). */
  protected readonly afterBills = computed(() => {
    const balance = this.finances.value()?.balance;
    const pending = this.stats.value()?.pendingThisMonth.total;
    if (balance == null || pending == null) return null;
    const owed = pending + this.overdueTotal();
    return { owed, amount: balance - owed };
  });
  protected readonly dueTabEmpty = computed(() => DUE_TABS.find((t) => t.key === this.dueTab())!.empty);

  protected readonly periodLabel = computed(() => {
    const { from, to } = this.bounds();
    const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
    if (this.range() === 'month') return from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (this.range() === 'year') return String(from.getFullYear());
    return `${from.toLocaleDateString(undefined, opts)} – ${to.toLocaleDateString(undefined, opts)}`;
  });

  protected readonly spendingChart = computed<ChartConfiguration>(() => {
    const buckets = buildBuckets(this.range(), this.stats.value()?.byDay ?? []);
    const muted = css('--text-muted');
    // Paid and pending stack in one bar; pending (still to pay, placed on its due date) is yellow.
    const bar = { borderRadius: 4, maxBarThickness: 42, borderSkipped: false as const };
    return {
      type: 'bar',
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          { label: 'Paid', data: buckets.map((b) => b.paid), backgroundColor: css('--primary'), ...bar },
          { label: 'Pending', data: buckets.map((b) => b.pending), backgroundColor: css('--warning'), ...bar },
        ],
      },
      options: {
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: muted, boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            filter: (item) => (item.parsed.y ?? 0) > 0,
            callbacks: {
              title: (items) => buckets[items[0].dataIndex].tooltip,
              label: (c) => `${c.dataset.label}: ${money(c.parsed.y ?? 0)}`,
              footer: (items) => {
                const b = buckets[items[0].dataIndex];
                return b.paid && b.pending ? `Total: ${money(b.paid + b.pending)}` : '';
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: muted, autoSkip: true, maxRotation: 0 } },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: css('--border') },
            ticks: { color: muted, callback: (v) => money(Number(v)) },
          },
        },
      },
    };
  });

  protected bills(count: number) {
    return `${count} ${count === 1 ? 'bill' : 'bills'}`;
  }

  private pieOptions(center?: PieLabelOptions['center']) {
    const labels: PieLabelOptions = {
      format: money,
      textColor: css('--text'),
      mutedColor: css('--text-muted'),
      lineColor: css('--text-muted'),
      center,
    };
    return {
      layout: { padding: PIE_LABEL_PADDING },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c: { label: string; raw: unknown }) => `${c.label}: ${money(Number(c.raw))}` } },
        pieLabels: labels,
      },
    };
  }

  protected readonly categoryChart = computed<ChartConfiguration>(() => {
    const cats = this.stats.value()?.byCategory ?? [];
    return {
      type: 'doughnut',
      data: {
        labels: cats.map((c) => c.name),
        datasets: [
          { data: cats.map((c) => c.total), backgroundColor: cats.map((c) => c.color), borderColor: css('--surface'), borderWidth: 2 },
        ],
      },
      options: { cutout: '55%', ...this.pieOptions({ label: 'Total', value: money(sum(cats)) }) },
      plugins: [pieLabelsPlugin],
    } as ChartConfiguration;
  });

  protected readonly statusChart = computed<ChartConfiguration>(() => {
    const rows = this.stats.value()?.byStatus ?? [];
    const colors: Record<string, string> = { Pending: css('--warning'), Paid: css('--success'), Cancelled: css('--text-muted') };
    return {
      type: 'pie',
      data: {
        labels: rows.map((r) => `${r.status} (${r.count})`),
        datasets: [
          { data: rows.map((r) => r.total), backgroundColor: rows.map((r) => colors[r.status]), borderColor: css('--surface'), borderWidth: 2 },
        ],
      },
      options: this.pieOptions(),
      plugins: [pieLabelsPlugin],
    } as ChartConfiguration;
  });

  protected onFinancesClosed(saved: boolean) {
    this.editingFinances.set(false);
    if (saved) this.finances.reload();
  }

  private reloadAll() {
    this.stats.reload();
    this.upcoming.reload();
    this.overdue.reload();
    // Paying or editing an expense can change the balance.
    this.finances.reload();
  }

  protected async markPaid(e: Expense) {
    const error = await this.expenses.markPaid(e);
    this.actionError.set(error);
    if (!error) this.reloadAll();
  }

  protected onFormClosed(saved: boolean) {
    this.adding.set(false);
    if (saved) this.reloadAll();
  }
}
