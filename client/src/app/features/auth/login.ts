import { Component, inject, input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { isDesktopApp } from '../../core/desktop-app';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
    <main class="auth-page">
      <form class="auth-card card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="brand"><span class="logo">$</span> Expense Tracker</div>
        <h1>Welcome back</h1>
        <p class="muted">Sign in to track and manage your expenses.</p>

        @if (auth.error(); as error) {
          <div class="alert alert-error" role="alert">{{ error }}</div>
        }

        <label class="field">
          <span>Email</span>
          <input type="email" formControlName="email" autocomplete="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <small class="field-error">Enter a valid email.</small>
          }
        </label>

        <label class="field">
          <span>Password</span>
          <input type="password" formControlName="password" autocomplete="current-password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <small class="field-error">Password is required.</small>
          }
        </label>

        <button class="btn btn-primary btn-block" type="submit" [disabled]="auth.loading()">
          {{ auth.loading() ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="switch">No account yet? <a routerLink="/register" (click)="auth.clearError()">Create one</a></p>
        @if (!inDesktopApp) {
          <p class="switch"><a routerLink="/download">Get the Windows app</a></p>
        }
      </form>
    </main>
  `,
})
export class LoginPage {
  protected readonly inDesktopApp = isDesktopApp();
  protected readonly auth = inject(AuthStore);
  readonly returnUrl = input<string>('/');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password, this.returnUrl() || '/');
  }
}
