import { Component, computed, inject } from '@angular/core';
import { PreferencesStore } from '../../core/preferences.store';
import { RouterLink } from '@angular/router';
import { CategoriesStore } from '../../state/categories.store';
import { RANGES, RangeKey } from '../dashboard/spending-periods';

@Component({
  selector: 'app-settings',
  imports: [RouterLink],
  styleUrl: './account.scss',
  template: `
    <div class="page-header">
      <div>
        <h1>Settings</h1>
        <p class="muted">Appearance and display preferences are saved on this device.</p>
      </div>
    </div>

    <section class="card section">
      <h2>Appearance</h2>
      <div class="setting-row">
        <div>
          <strong>Dark mode</strong>
          <small class="muted">Use a dark color scheme.</small>
        </div>
        <button
          type="button"
          class="switch"
          role="switch"
          aria-label="Dark mode"
          [attr.aria-checked]="prefs.theme() === 'dark'"
          (click)="prefs.toggleTheme()"
        >
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="card section">
      <h2>Dashboard</h2>
      <div class="setting-row">
        <div>
          <strong>Default chart period</strong>
          <small class="muted">The spending chart opens on this period.</small>
        </div>
        <select [value]="prefs.dashboardRange()" (change)="setRange($event)" aria-label="Default chart period">
          @for (r of ranges; track r.key) {
            <option [value]="r.key" [selected]="r.key === prefs.dashboardRange()">{{ r.label }}</option>
          }
        </select>
      </div>
    </section>

    <section class="card section">
      <h2>Categories</h2>
      <div class="setting-row">
        <div>
          <strong>Expense categories</strong>
          <small class="muted">{{ categoryCount() }} {{ categoryCount() === 1 ? 'category' : 'categories' }} · add, rename, recolor or delete.</small>
        </div>
        <a class="btn btn-ghost btn-outline" routerLink="/settings/categories">Edit</a>
      </div>
    </section>
  `,
})
export class SettingsPage {
  protected readonly prefs = inject(PreferencesStore);
  protected readonly ranges = RANGES;
  private readonly categories = inject(CategoriesStore);
  protected readonly categoryCount = computed(() => this.categories.items().length);

  protected setRange(event: Event) {
    this.prefs.setDashboardRange((event.target as HTMLSelectElement).value as RangeKey);
  }
}
