import { Component } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { BalanceEntry, BalanceEntryKind, Finances } from '../../core/models';

const KIND_LABEL: Record<BalanceEntryKind, string> = {
  Manual: 'Set by hand',
  Income: 'Income',
  IncomeReversed: 'Income removed',
  ExpensePaid: 'Expense paid',
  ExpenseReturned: 'Returned',
  ExpenseAdjusted: 'Adjusted',
};

/** Every change to the balance, with a note saying where it came from. */
@Component({
  selector: 'app-activity',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  styleUrl: './income.scss',
  template: `
    <a class="back-link" routerLink="/dashboard">← Dashboard</a>
    <div class="page-header">
      <div>
        <h1>Balance activity</h1>
        <p class="muted">Income, paid expenses, and anything added back to your balance.</p>
      </div>
      @if (finances.value(); as f) {
        <div class="card summary-item">
          <span class="label">Current balance</span>
          <strong>{{ f.balance === null ? '—' : (f.balance | currency) }}</strong>
        </div>
      }
    </div>

    <section class="card section" [class.loading]="entries.isLoading()">
      @for (e of entries.value() ?? []; track e.id) {
        <div class="row activity-row">
          <div class="row-main">
            <strong [title]="e.description">{{ e.description }}</strong>
            <small class="muted">{{ kindLabel(e) }} · {{ e.createdAt | date: 'MMM d, y, h:mm a' }}</small>
          </div>
          <span class="amount" [class.positive]="e.amount > 0" [class.negative]="e.amount < 0">
            {{ e.amount > 0 ? '+' : e.amount < 0 ? '−' : '' }}{{ abs(e.amount) | currency }}
          </span>
          <small class="muted balance-after">Balance {{ e.balanceAfter | currency }}</small>
        </div>
      } @empty {
        @if (!entries.isLoading()) {
          <p class="muted empty">
            No activity yet. Set your balance on the dashboard; paid expenses and income will show up here.
          </p>
        }
      }
    </section>
  `,
  styles: `
    .activity-row {
      grid-template-columns: 1fr auto 150px;
    }
    .balance-after {
      text-align: right;
    }
    .negative {
      color: var(--danger);
    }
    @media (max-width: 640px) {
      .activity-row {
        grid-template-columns: 1fr auto;
      }
      .balance-after {
        grid-column: 2;
      }
    }
  `,
})
export class ActivityPage {
  protected readonly entries = httpResource<BalanceEntry[]>(() => '/api/finances/activity');
  protected readonly finances = httpResource<Finances>(() => '/api/finances');
  protected readonly abs = Math.abs;

  protected kindLabel(e: BalanceEntry) {
    return KIND_LABEL[e.kind];
  }
}
