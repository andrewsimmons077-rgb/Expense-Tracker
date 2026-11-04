import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/utils';

/** Pop-up for setting the current balance by hand. */
@Component({
  selector: 'app-balance-form',
  imports: [FormsModule],
  host: { '(document:keydown.escape)': 'closed.emit(false)' },
  template: `
    <div class="modal-backdrop" (click)="closed.emit(false)"></div>
    <form class="modal modal-sm card" (ngSubmit)="submit()" role="dialog" aria-modal="true" novalidate>
      <header class="modal-header">
        <h2>Current balance</h2>
        <button class="btn btn-ghost btn-icon" type="button" aria-label="Close" (click)="closed.emit(false)">✕</button>
      </header>

      @if (error(); as error) {
        <div class="alert alert-error" role="alert">{{ error }}</div>
      }

      <label class="field">
        <span>How much money do you have right now?</span>
        <input type="number" name="balance" step="0.01" inputmode="decimal" placeholder="e.g. 2500.00" [(ngModel)]="value" />
        <small class="muted hint">Income from your sources is added automatically on each pay date.</small>
      </label>

      <footer class="modal-footer">
        <button class="btn btn-ghost" type="button" (click)="closed.emit(false)">Cancel</button>
        <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </footer>
    </form>
  `,
})
export class BalanceForm implements OnInit {
  readonly balance = input<number | null>(null);
  /** Emits true when the balance was saved. */
  readonly closed = output<boolean>();

  private readonly http = inject(HttpClient);
  protected value: number | null = null;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit() {
    this.value = this.balance();
  }

  async submit() {
    // An empty input means "no balance set", not zero.
    const balance = this.value === null || (this.value as unknown) === '' ? null : Number(this.value);
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put('/api/finances/balance', { balance }));
      this.closed.emit(true);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
