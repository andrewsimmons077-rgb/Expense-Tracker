import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PreferencesStore } from './core/preferences.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Created at startup so the saved theme is applied on every page, including login.
  private readonly preferences = inject(PreferencesStore);
}
