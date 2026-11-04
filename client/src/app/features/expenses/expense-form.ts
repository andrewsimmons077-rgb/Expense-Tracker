import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { EXPENSE_STATUSES, Expense, ExpenseStatus, RECURRENCES, Recurrence } from '../../core/models';
import { CategoriesStore } from '../../state/categories.store';
import { ExpensesStore } from '../../state/expenses.store';

function dueAfterDate(group: AbstractControl): ValidationErrors | null {
  const { date, dueDate } = group.value as { date: string; dueDate: string };
  return date && dueDate && dueDate < date ? { dueBeforeDate: true } : null;
}

/** Modal used for both creating (expense = null) and editing an expense. */
@Component({
  selector: 'app-expense-form',
  imports: [ReactiveFormsModule],
  host: { '(document:keydown.escape)': 'closed.emit(false)' },
  template: `
    <div class="modal-backdrop" (click)="closed.emit(false)"></div>
    <form class="modal card" [formGroup]="form" (ngSubmit)="submit()" role="dialog" aria-modal="true" novalidate>
      <header class="modal-header">
        <h2>{{ expense() ? 'Edit expense' : 'New expense' }}</h2>
        <button class="btn btn-ghost btn-icon" type="button" aria-label="Close" (click)="closed.emit(false)">✕</button>
      </header>

      @if (error(); as error) {
        <div class="alert alert-error" role="alert">{{ error }}</div>
      }

      <div class="form-grid">
        <label class="field span-2">
          <span>Title</span>
          <input type="text" formControlName="title" placeholder="e.g. Electricity bill" />
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
          <span>Category</span>
          <select formControlName="categoryId">
            <option [ngValue]="null">Uncategorized</option>
            @for (c of categories.items(); track c.id) {
              <option [ngValue]="c.id">{{ c.name }}</option>
            }
          </select>
        </label>

        <!-- New expenses only ask for a due date (it doubles as the expense date); older ones keep both editable. -->
        @if (expense()) {
          <label class="field">
            <span>Date</span>
            <input type="date" formControlName="date" />
          </label>
        }

        <label class="field" [class.span-2]="!expense()">
          <span>Due date</span>
          <input type="date" formControlName="dueDate" />
          @if (form.controls.dueDate.touched && form.controls.dueDate.invalid) {
            <small class="field-error">Due date is required.</small>
          }
          @if (form.hasError('dueBeforeDate')) {
            <small class="field-error">Due date can't be before the expense date.</small>
          }
        </label>

        <fieldset class="field span-2">
          <legend>Status</legend>
          <div class="segmented">
            @for (s of statusOptions(); track s) {
              <label [class.selected]="form.controls.status.value === s">
                <input type="radio" formControlName="status" [value]="s" />
                {{ s }}
              </label>
            }
          </div>
        </fieldset>

        <fieldset class="field span-2">
          <legend>Repeats</legend>
          <div class="segmented">
            @for (r of recurrences; track r.value) {
              <label [class.selected]="form.controls.recurrence.value === r.value">
                <input type="radio" formControlName="recurrence" [value]="r.value" />
                {{ r.label }}
              </label>
            }
          </div>
          @if (form.controls.recurrence.value !== 'None') {
            <small class="muted hint">
              When this is marked paid, next {{ form.controls.recurrence.value === 'Monthly' ? "month's" : "year's" }} payment is added
              automatically as Pending.
            </small>
          }
        </fieldset>

        <label class="field span-2">
          <span>Notes <em class="muted">(optional)</em></span>
          <textarea formControlName="notes" rows="3"></textarea>
        </label>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-ghost" type="button" (click)="closed.emit(false)">Cancel</button>
        <button class="btn btn-primary" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : expense() ? 'Save changes' : 'Add expense' }}
        </button>
      </footer>
    </form>
  `,
})
export class ExpenseForm implements OnInit {
  readonly expense = input<Expense | null>(null);
  /** Emits true when something was saved. */
  readonly closed = output<boolean>();

  protected readonly categories = inject(CategoriesStore);
  private readonly expenses = inject(ExpensesStore);
  /** Cancelled only makes sense for an expense that already exists. */
  protected readonly statusOptions = computed(() =>
    this.expense() ? EXPENSE_STATUSES : EXPENSE_STATUSES.filter((s) => s !== 'Cancelled'),
  );
  protected readonly recurrences = RECURRENCES;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group(
    {
      title: ['', [Validators.required, Validators.maxLength(200)]],
      amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
      categoryId: [null as string | null],
      date: [''],
      dueDate: ['', Validators.required],
      status: ['Pending' as ExpenseStatus, Validators.required],
      recurrence: ['None' as Recurrence, Validators.required],
      notes: [''],
    },
    { validators: dueAfterDate },
  );

  ngOnInit() {
    const e = this.expense();
    if (e) {
      this.form.setValue({
        title: e.title,
        amount: e.amount,
        categoryId: e.categoryId,
        date: e.date,
        dueDate: e.dueDate ?? e.date,
        status: e.status,
        recurrence: e.recurrence,
        notes: e.notes ?? '',
      });
    }
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    const error = await this.expenses.save(
      {
        title: v.title!.trim(),
        amount: Number(v.amount),
        categoryId: v.categoryId,
        date: v.date || v.dueDate!,
        dueDate: v.dueDate!,
        status: v.status!,
        recurrence: v.recurrence!,
        notes: v.notes?.trim() || null,
      },
      this.expense()?.id,
    );
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.closed.emit(true);
  }
}
