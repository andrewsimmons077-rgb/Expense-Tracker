import { effect } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { RangeKey } from '../features/dashboard/spending-periods';

export type Theme = 'light' | 'dark';

interface PreferencesState {
  theme: Theme;
  dashboardRange: RangeKey;
}

const STORAGE_KEY = 'expense-tracker.preferences';

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadPersisted(): PreferencesState {
  const defaults: PreferencesState = { theme: systemTheme(), dashboardRange: 'month' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<PreferencesState>) } : defaults;
  } catch {
    return defaults;
  }
}

/** Per-device display preferences, kept in localStorage. */
export const PreferencesStore = signalStore(
  { providedIn: 'root' },
  withState<PreferencesState>(loadPersisted),
  withMethods((store) => ({
    setTheme: (theme: Theme) => patchState(store, { theme }),
    toggleTheme: () => patchState(store, { theme: store.theme() === 'dark' ? 'light' : 'dark' }),
    setDashboardRange: (dashboardRange: RangeKey) => patchState(store, { dashboardRange }),
  })),
  withHooks({
    onInit(store) {
      effect(() => {
        const state = { theme: store.theme(), dashboardRange: store.dashboardRange() };
        document.documentElement.dataset['theme'] = state.theme;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          /* storage unavailable – preference lasts for this visit only */
        }
      });
    },
  }),
);
