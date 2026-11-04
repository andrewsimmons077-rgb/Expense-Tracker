import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IncomeSource, PAY_FREQUENCIES, PayFrequency } from '../../core/models';
import { errorMessage, toIsoDate } from '../../core/utils';

/** Pop-up for adding or editing a recurring income source. */
@Component({
  selector: 'app-income-source-form',
  imports: [ReactiveFormsModule],
  host: { '(document:keydown.escape)': 'closed.emit(false)' },
  template: `
    <div class="modal-backdrop" (click)="closed.emit(false)"></div>
    <form class="modal card" [formGroup]="form" (ngSubmit)="submit()" role="dialog" aria-modal="true" novalidate>
      <header class="modal-header">
        <h2>{{ source() ? 'Edit income source' : 'New income source' }}</h2>
        <button class="btn btn-ghost btn-icon" type="button" aria-label="Close" (click)="closed.emit(false)">✕</button>
      </header>

      @if (error(); as error) {
        <div class="alert alert-error" role="alert">{{ error }}</div>
      }

      <div class="form-grid">
        <label class="field span-2">
          <span>Title</span>
          <input type="text" formControlName="title" placeholder="e.g. Paycheck, Rental income" />
          @if (form.controls.title.touched && form.controls.title.invalid) {
            <small class="field-error">Title is required.</small>
          }
        </label>

        <label class="field">
          <span>Amount <em class="muted">(after tax)</em></span>
          <input type="number" formControlName="amount" min="0.01" step="0.01" inputmode="decimal" />
          @if (form.controls.amount.touched && form.controls.amount.invalid) {
            <small class="field-error">Enter an amount greater than 0.</small>
          }
        </label>

        <label class="field">
          <span>Paid</span>
          <select formControlName="frequency">
            @for (f of frequencies; track f.value) {
              <option [ngValue]="f.value">{{ f.label }}</option>
            }
          </select>
        </label>

        <label class="field span-2">
          <span>Next pay date</span>
          <input type="date" formControlName="nextPayDate" [min]="today" />
          @if (form.controls.nextPayDate.touched && form.controls.nextPayDate.invalid) {
            <small class="field-error">Choose today or a future date.</small>
          }
          <small class="muted hint">On each pay date the amount is added to your balance, then the next date is scheduled.</small>
        </label>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-ghost" type="button" (click)="closed.emit(false)">Cancel</button>
        <button class="btn btn-primary" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : source() ? 'Save changes' : 'Add source' }}
        </button>
      </footer>
    </form>
  `,
})
export class IncomeSourceForm implements OnInit {
  readonly source = input<IncomeSource | null>(null);
  readonly closed = output<boolean>();

  private readonly http = inject(HttpClient);
  protected readonly frequencies = PAY_FREQUENCIES;
  protected readonly today = toIsoDate(new Date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    frequency: ['Biweekly' as PayFrequency],
    nextPayDate: ['', [Validators.required, (c: { value: string }) => (c.value && c.value < this.today ? { past: true } : null)]],
  });

  ngOnInit() {
    const s = this.source();
    if (s) this.form.setValue({ title: s.title, amount: s.amount, frequency: s.frequency, nextPayDate: s.nextPayDate });
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body = { title: v.title!.trim(), amount: Number(v.amount), frequency: v.frequency, nextPayDate: v.nextPayDate };
    const id = this.source()?.id;
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(id ? this.http.put(`/api/income/sources/${id}`, body) : this.http.post('/api/income/sources', body));
      this.closed.emit(true);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Pop-up for one-time pay: irregular amounts, bonuses, gifts, etc. */
@Component({
  selector: 'app-one-time-pay-form',
  imports: [ReactiveFormsModule],
  host: { '(document:keydown.escape)': 'closed.emit(false)' },
  template: `
    <div class="modal-backdrop" (click)="closed.emit(false)"></div>
    <form class="modal card" [formGroup]="form" (ngSubmit)="submit()" role="dialog" aria-modal="true" novalidate>
      <header class="modal-header">
        <h2>Add one-time pay</h2>
        <button class="btn btn-ghost btn-icon" type="button" aria-label="Close" (click)="closed.emit(false)">✕</button>
      </header>

      @if (error(); as error) {
        <div class="alert alert-error" role="alert">{{ error }}</div>
      }

      <div class="form-grid">
        @if (sources().length) {
          <label class="field span-2">
            <span>From <em class="muted">(optional)</em></span>
            <select formControlName="incomeSourceId" (change)="onSourceChange()">
              <option [ngValue]="null">Not from a source</option>
              @for (s of sources(); track s.id) {
                <option [ngValue]="s.id">{{ s.title }}</option>
              }
            </select>
          </label>
        }

        <label class="field span-2">
          <span>Title</span>
          <input type="text" formControlName="title" placeholder="e.g. Bonus, Freelance job, Gift" />
          @if (form.controls.title.touched && form.controls.title.invalid) {
            <small class="field-error">Title is required.</small>
          }
        </label>

        <label class="field">
          <span>Amount</span>
          <input type="number" formControlName="amount" min="0.01" step="0.01" inputmode="decimal" />
          @if (form.controls.amount.touched && form.controls.amount.invalid) {
            <small class="field-error">Enter an amount greater than 0.</small>
          }
        </label>

        <label class="field">
          <span>Pay date</span>
          <input type="date" formControlName="date" />
          @if (form.controls.date.touched && form.controls.date.invalid) {
            <small class="field-error">Pay date is required.</small>
          }
        </label>
      </div>
      <small class="muted hint">
        @if (form.controls.date.value && form.controls.date.value <= today) {
          This date has arrived, so the amount is added to your balance as soon as you save.
        } @else {
          The amount is added to your balance on the pay date.
        }
      </small>

      <footer class="modal-footer">
        <button class="btn btn-ghost" type="button" (click)="closed.emit(false)">Cancel</button>
        <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Add pay' }}</button>
      </footer>
    </form>
  `,
})
export class OneTimePayForm {
  readonly sources = input<IncomeSource[]>([]);
  readonly closed = output<boolean>();

  private readonly http = inject(HttpClient);
  protected readonly today = toIsoDate(new Date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    incomeSourceId: [null as string | null],
    title: ['', [Validators.required, Validators.maxLength(100)]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    date: [this.today, Validators.required],
  });

  /** Picking a source fills in its title, unless the user already typed one. */
  protected onSourceChange() {
    const source = this.sources().find((s) => s.id === this.form.controls.incomeSourceId.value);
    if (source && !this.form.controls.title.dirty) this.form.controls.title.setValue(source.title);
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post('/api/income/payments', {
          title: v.title!.trim(),
          amount: Number(v.amount),
          date: v.date,
          incomeSourceId: v.incomeSourceId,
        }),
      );
      this.closed.emit(true);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
