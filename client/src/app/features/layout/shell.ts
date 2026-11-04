import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { CategoriesStore } from '../../state/categories.store';

@Component({
  selector: 'app-shell',
  host: {
    '(document:click)': 'menuOpen.set(false)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './shell.scss',
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/dashboard"><span class="logo">$</span><span class="brand-name">Expense Tracker</span></a>

      <nav class="nav" aria-label="Main">
        @for (link of links; track link.path) {
          <a [routerLink]="link.path" routerLinkActive="active">
            <span class="nav-icon" aria-hidden="true">{{ link.icon }}</span>
            <span>{{ link.label }}</span>
          </a>
        }
      </nav>

      <div class="user">
        <button
          type="button"
          class="user-button"
          aria-haspopup="menu"
          [attr.aria-expanded]="menuOpen()"
          (click)="menuOpen.set(!menuOpen()); $event.stopPropagation()"
        >
          <span class="avatar">{{ initials() }}</span>
          <span class="user-name">{{ auth.user()?.displayName }}</span>
          <span class="caret" aria-hidden="true">▾</span>
        </button>

        @if (menuOpen()) {
          <div class="menu card" role="menu" (click)="$event.stopPropagation()">
            <div class="menu-header">
              <strong>{{ auth.user()?.displayName }}</strong>
              <small class="muted">{{ auth.user()?.email }}</small>
            </div>
            <a role="menuitem" routerLink="/profile" (click)="menuOpen.set(false)">Profile</a>
            <a role="menuitem" routerLink="/settings" (click)="menuOpen.set(false)">Settings</a>
            <button role="menuitem" type="button" class="logout" (click)="menuOpen.set(false); auth.logout()">Log out</button>
          </div>
        }
      </div>
    </header>

    <main class="content">
      <router-outlet />
    </main>
  `,
})
export class Shell implements OnInit {
  protected readonly auth = inject(AuthStore);
  private readonly categories = inject(CategoriesStore);
  protected readonly menuOpen = signal(false);

  protected readonly links = [
    { path: '/dashboard', label: 'Dashboard', icon: '◔' },
    { path: '/expenses', label: 'Expenses', icon: '☰' },
    { path: '/income', label: 'Income', icon: '⇡' },
  ];

  ngOnInit() {
    this.categories.load();
  }

  protected initials() {
    const name = this.auth.user()?.displayName ?? '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('');
  }
}
