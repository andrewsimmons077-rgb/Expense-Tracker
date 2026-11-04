import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Finances, IncomeOverview, IncomePayment, IncomeSource, PAY_FREQUENCIES } from '../../core/models';
import { daysUntil, errorMessage } from '../../core/utils';
import { IncomeSourceForm, OneTimePayForm } from './income-forms';

const FREQUENCY_LABEL = Object.fromEntries(PAY_FREQUENCIES.map((f) => [f.value, f.label.toLowerCase()]));

@Component({
  selector: 'app-income',
  imports: [CurrencyPipe, DatePipe, IncomeSourceForm, OneTimePayForm],
  styleUrl: './income.scss',
  template: `
    <div class="page-header">
      <div>
        <h1>Income</h1>
        <p class="muted">Pay is added to your balance automatically on each pay date.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost btn-outline" type="button" (click)="addingOneTime.set(true)">+ One-time pay</button>
        <button class="btn btn-primary" type="button" (click)="editingSource.set('new')">+ Income source</button>
      </div>
    </div>

    @if (error(); as error) {
      <div class="alert alert-error" role="alert">{{ error }}</div>
    }

    @if (finances.value(); as f) {
      <section class="summary">
        <div class="card summary-item">
          <span class="label">Current balance</span>
          <strong>{{ f.balance === null ? '—' : (f.balance | currency) }}</strong>
        </div>
        <div class="card summary-item">
          <span class="label">Monthly income</span>
          <strong>{{ f.monthlyIncome | currency }}</strong>
        </div>
        <div class="card summary-item">
          <span class="label">Next pay</span>
          @if (f.nextPay; as next) {
            <strong>{{ next.amount | currency }}</strong>
            <small class="muted">{{ next.title }} · {{ next.date | date: 'MMM d' }}</small>
          } @else {
            <strong class="muted">—</strong>
          }
        </div>
      </section>
    }

    <section class="card section" [class.loading]="income.isLoading()">
      <h2>Income sources</h2>
      @for (s of income.value()?.sources ?? []; track s.id) {
        <div class="row">
          <div class="row-main">
            <strong>{{ s.title }}</strong>
            <small class="muted">{{ s.amount | currency }} {{ frequencyLabel(s) }} · ≈ {{ s.monthlyAmount | currency }}/month</small>
          </div>
          <div class="row-date">
            <span>{{ s.nextPayDate | date: 'MMM d, y' }}</span>
            <small class="muted">{{ whenLabel(s.nextPayDate) }}</small>
          </div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" type="button" (click)="editingSource.set(s)">Edit</button>
            <button class="btn btn-ghost btn-sm danger" type="button" (click)="deleteSource(s)">Delete</button>
          </div>
        </div>
      } @empty {
        @if (!income.isLoading()) {
          <div class="empty">
            <p class="muted">No income sources yet. Add your paycheck or any other regular income.</p>
            <button class="btn btn-primary" type="button" (click)="editingSource.set('new')">Add income source</button>
          </div>
        }
      }
    </section>

    @if (income.value()?.scheduled?.length) {
      <section class="card section">
        <h2>Scheduled one-time pay</h2>
        @for (p of income.value()!.scheduled; track p.id) {
          <div class="row">
            <div class="row-main">
              <strong>{{ p.title }}</strong>
              <small class="muted">{{ sourceName(p) }}</small>
            </div>
            <div class="row-date">
              <span>{{ p.date | date: 'MMM d, y' }}</span>
              <small class="muted">{{ whenLabel(p.date) }}</small>
            </div>
            <span class="amount">{{ p.amount | currency }}</span>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm danger" type="button" (click)="deletePayment(p)">Delete</button>
            </div>
          </div>
        }
      </section>
    }

    <section class="card section">
      <h2>Received</h2>
      @for (p of income.value()?.received ?? []; track p.id) {
        <div class="row">
          <div class="row-main">
            <strong>{{ p.title }}</strong>
            <small class="muted">{{ p.oneTime ? 'One-time pay' : 'From income source' }}</small>
          </div>
          <div class="row-date">
            <span>{{ p.date | date: 'MMM d, y' }}</span>
          </div>
          <span class="amount positive">+{{ p.amount | currency }}</span>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm danger" type="button" (click)="deletePayment(p)" title="Remove and take it back off your balance">
              Undo
            </button>
          </div>
        </div>
      } @empty {
        <p class="muted empty">Nothing received yet.</p>
      }
    </section>

    @if (editingSource(); as current) {
      <app-income-source-form [source]="current === 'new' ? null : current" (closed)="onSourceClosed($event)" />
    }
    @if (addingOneTime()) {
      <app-one-time-pay-form [sources]="income.value()?.sources ?? []" (closed)="onOneTimeClosed($event)" />
    }
  `,
})
export class IncomePage {
  private readonly http = inject(HttpClient);
  protected readonly income = httpResource<IncomeOverview>(() => '/api/income');
  protected readonly finances = httpResource<Finances>(() => '/api/finances');
  protected readonly editingSource = signal<IncomeSource | 'new' | null>(null);
  protected readonly addingOneTime = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly sourceTitles = computed(() => new Map((this.income.value()?.sources ?? []).map((s) => [s.id, s.title])));

  protected frequencyLabel(s: IncomeSource) {
    return FREQUENCY_LABEL[s.frequency];
  }

  protected sourceName(p: IncomePayment) {
    return (p.incomeSourceId && this.sourceTitles().get(p.incomeSourceId)) || 'One-time pay';
  }

  protected whenLabel(date: string) {
    const days = daysUntil(date);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  }

  private reload() {
    this.income.reload();
    this.finances.reload();
  }

  protected onSourceClosed(saved: boolean) {
    this.editingSource.set(null);
    if (saved) this.reload();
  }

  protected onOneTimeClosed(saved: boolean) {
    this.addingOneTime.set(false);
    if (saved) this.reload();
  }

  protected async deleteSource(s: IncomeSource) {
    if (!confirm(`Delete "${s.title}"? Pay already received stays in your history and balance.`)) return;
    await this.run(() => this.http.delete(`/api/income/sources/${s.id}`));
  }

  protected async deletePayment(p: IncomePayment) {
    const message = p.received
      ? `Remove "${p.title}" (${p.amount.toFixed(2)})? It will be taken back off your balance.`
      : `Delete scheduled pay "${p.title}"?`;
    if (!confirm(message)) return;
    await this.run(() => this.http.delete(`/api/income/payments/${p.id}`));
  }

  private async run(request: () => ReturnType<HttpClient['delete']>) {
    this.error.set(null);
    try {
      await firstValueFrom(request());
      this.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
