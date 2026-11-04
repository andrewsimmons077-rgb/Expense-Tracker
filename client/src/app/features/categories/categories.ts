import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Category } from '../../core/models';
import { CategoriesStore } from '../../state/categories.store';

const PALETTE = ['#6366f1', '#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'];

@Component({
  selector: 'app-categories',
  imports: [FormsModule, RouterLink],
  styleUrl: './categories.scss',
  template: `
    <a class="back-link" routerLink="/settings">← Settings</a>
    <div class="page-header">
      <div>
        <h1>Categories</h1>
        <p class="muted">Group your expenses. Deleting a category leaves its expenses uncategorized.</p>
      </div>
    </div>

    @if (error(); as error) {
      <div class="alert alert-error" role="alert">{{ error }}</div>
    }

    <form class="card add-form" (ngSubmit)="save()">
      <input type="text" name="name" [(ngModel)]="name" placeholder="Category name" maxlength="50" required />
      <div class="swatches" role="radiogroup" aria-label="Color">
        @for (c of palette; track c) {
          <button
            type="button"
            class="swatch"
            [style.background]="c"
            [class.selected]="color() === c"
            [attr.aria-label]="c"
            (click)="color.set(c)"
          ></button>
        }
        <input type="color" name="color" [ngModel]="color()" (ngModelChange)="color.set($event)" aria-label="Custom color" />
      </div>
      <div class="form-actions">
        @if (editingId()) {
          <button class="btn btn-ghost" type="button" (click)="cancelEdit()">Cancel</button>
        }
        <button class="btn btn-primary" type="submit" [disabled]="!name().trim()">
          {{ editingId() ? 'Save' : 'Add category' }}
        </button>
      </div>
    </form>

    <ul class="category-list">
      @for (c of store.items(); track c.id) {
        <li class="card">
          <span class="swatch static" [style.background]="c.color"></span>
          <div class="info">
            <strong>{{ c.name }}</strong>
            <small class="muted">{{ c.expenseCount }} {{ c.expenseCount === 1 ? 'expense' : 'expenses' }}</small>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" (click)="edit(c)">Edit</button>
          <button class="btn btn-ghost btn-sm danger" type="button" (click)="remove(c)">Delete</button>
        </li>
      } @empty {
        @if (!store.loading()) {
          <li class="muted">No categories yet.</li>
        }
      }
    </ul>
  `,
})
export class CategoriesPage {
  protected readonly store = inject(CategoriesStore);
  protected readonly palette = PALETTE;
  protected readonly name = signal('');
  protected readonly color = signal(PALETTE[0]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected edit(c: Category) {
    this.editingId.set(c.id);
    this.name.set(c.name);
    this.color.set(c.color);
    this.error.set(null);
  }

  protected cancelEdit() {
    this.editingId.set(null);
    this.name.set('');
    this.color.set(PALETTE[0]);
  }

  protected async save() {
    const error = await this.store.save({ name: this.name().trim(), color: this.color() }, this.editingId() ?? undefined);
    this.error.set(error);
    if (!error) this.cancelEdit();
  }

  protected async remove(c: Category) {
    const msg = c.expenseCount
      ? `Delete "${c.name}"? Its ${c.expenseCount} expense(s) will become uncategorized.`
      : `Delete "${c.name}"?`;
    if (!confirm(msg)) return;
    this.error.set(await this.store.remove(c.id));
  }
}
