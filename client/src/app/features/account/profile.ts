import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { User } from '../../core/models';
import { errorMessage } from '../../core/utils';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile',
  imports: [DatePipe, ReactiveFormsModule],
  styleUrl: './account.scss',
  host: { '(document:keydown.escape)': 'closePasswordDialog()' },
  template: `
    <div class="page-header">
      <h1>Profile</h1>
    </div>

    <section class="card section">
      @if (user.value(); as u) {
        <div class="profile-head">
          <span class="avatar-lg">{{ initials() }}</span>
          <div>
            <h2>{{ u.displayName }}</h2>
            <span class="muted">{{ u.email }}</span>
          </div>
        </div>
        <dl class="details">
          <div>
            <dt>Name</dt>
            <dd>{{ u.displayName }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ u.email }}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{{ u.createdAt | date: 'longDate' }}</dd>
          </div>
        </dl>
      } @else if (user.error()) {
        <div class="alert alert-error" role="alert">Couldn't load your profile.</div>
      } @else {
        <p class="muted">Loading…</p>
      }
    </section>

    <section class="card section">
      <h2>Security</h2>
      @if (success()) {
        <div class="alert alert-success" role="status">Your password has been changed.</div>
      }
      <div class="setting-row">
        <div>
          <strong>Password</strong>
          <small class="muted">Change the password you use to sign in.</small>
        </div>
        <button class="btn btn-ghost btn-outline" type="button" (click)="openPasswordDialog()">Change password</button>
      </div>
    </section>

    @if (passwordDialogOpen()) {
      <div class="modal-backdrop" (click)="closePasswordDialog()"></div>
      <form
        class="modal modal-sm card password-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        [formGroup]="form"
        (ngSubmit)="changePassword()"
        novalidate
      >
        <header class="modal-header">
          <h2 id="password-title">Change password</h2>
          <button class="btn btn-ghost btn-icon" type="button" aria-label="Close" (click)="closePasswordDialog()">✕</button>
        </header>

        @if (error(); as error) {
          <div class="alert alert-error" role="alert">{{ error }}</div>
        }

        <label class="field">
          <span>Current password</span>
          <input type="password" formControlName="currentPassword" autocomplete="current-password" />
          @if (form.controls.currentPassword.touched && form.controls.currentPassword.invalid) {
            <small class="field-error">Enter your current password.</small>
          }
        </label>
        <label class="field">
          <span>New password</span>
          <input type="password" formControlName="newPassword" autocomplete="new-password" />
          @if (form.controls.newPassword.touched && form.controls.newPassword.invalid) {
            <small class="field-error">At least 8 characters.</small>
          }
        </label>
        <label class="field">
          <span>Confirm new password</span>
          <input type="password" formControlName="confirm" autocomplete="new-password" />
          @if (form.controls.confirm.touched && form.hasError('mismatch')) {
            <small class="field-error">Passwords don't match.</small>
          }
        </label>

        <footer class="modal-footer">
          <button class="btn btn-ghost" type="button" (click)="closePasswordDialog()">Cancel</button>
          <button class="btn btn-primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Change password' }}
          </button>
        </footer>
      </form>
    }
  `,
})
export class ProfilePage {
  private readonly http = inject(HttpClient);
  protected readonly user = httpResource<User>(() => '/api/auth/me');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly passwordDialogOpen = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly initials = computed(() =>
    (this.user.value()?.displayName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  );

  protected openPasswordDialog() {
    this.form.reset();
    this.error.set(null);
    this.success.set(false);
    this.passwordDialogOpen.set(true);
  }

  protected closePasswordDialog() {
    this.passwordDialogOpen.set(false);
  }

  protected async changePassword() {
    this.success.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/auth/change-password', { currentPassword, newPassword }));
      this.form.reset();
      this.passwordDialogOpen.set(false);
      this.success.set(true);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
