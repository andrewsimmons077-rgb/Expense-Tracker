import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
    <main class="auth-page">
      <form class="auth-card card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="brand"><span class="logo">$</span> Expense Tracker</div>
        <h1>Create your account</h1>
        <p class="muted">We'll set you up with a few starter categories.</p>

        @if (auth.error(); as error) {
          <div class="alert alert-error" role="alert">{{ error }}</div>
        }

        <label class="field">
          <span>Name</span>
          <input type="text" formControlName="displayName" autocomplete="name" />
          @if (form.controls.displayName.touched && form.controls.displayName.invalid) {
            <small class="field-error">Name is required.</small>
          }
        </label>

        <label class="field">
          <span>Email</span>
          <input type="email" formControlName="email" autocomplete="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <small class="field-error">Enter a valid email.</small>
          }
        </label>

        <label class="field">
          <span>Password</span>
          <input type="password" formControlName="password" autocomplete="new-password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <small class="field-error">At least 8 characters.</small>
          }
        </label>

        <label class="field">
          <span>Confirm password</span>
          <input type="password" formControlName="confirm" autocomplete="new-password" />
          @if (form.controls.confirm.touched && form.hasError('mismatch')) {
            <small class="field-error">Passwords don't match.</small>
          }
        </label>

        <button class="btn btn-primary btn-block" type="submit" [disabled]="auth.loading()">
          {{ auth.loading() ? 'Creating account…' : 'Create account' }}
        </button>

        <p class="switch">Already registered? <a routerLink="/login" (click)="auth.clearError()">Sign in</a></p>
      </form>
    </main>
  `,
})
export class RegisterPage {
  protected readonly auth = inject(AuthStore);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, email, password } = this.form.getRawValue();
    this.auth.register(displayName, email, password);
  }
}
