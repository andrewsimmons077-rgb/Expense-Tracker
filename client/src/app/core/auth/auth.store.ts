import { computed, inject, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, User } from '../models';
import { errorMessage } from '../utils';
import { CategoriesStore } from '../../state/categories.store';
import { ExpensesStore } from '../../state/expenses.store';

const STORAGE_KEY = 'expense-tracker.auth';

interface AuthState {
  token: string | null;
  expiresAt: number;
  user: User | null;
  loading: boolean;
  error: string | null;
}

function loadPersisted(): AuthState {
  const empty: AuthState = { token: null, expiresAt: 0, user: null, loading: false, error: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Pick<AuthState, 'token' | 'expiresAt' | 'user'>;
    return saved.expiresAt > Date.now() ? { ...empty, ...saved } : empty;
  } catch {
    return empty;
  }
}

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>(loadPersisted),
  withComputed((store) => ({
    isAuthenticated: computed(() => !!store.token() && store.expiresAt() > Date.now()),
  })),
  withMethods((store, http = inject(HttpClient), router = inject(Router), injector = inject(Injector)) => {
    function setSession(res: AuthResponse) {
      const session = { token: res.token, expiresAt: Date.parse(res.expiresAt), user: res.user };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        /* storage unavailable – session lives in memory only */
      }
      patchState(store, { ...session, loading: false, error: null });
    }

    async function authenticate(url: string, body: object, redirectTo: string) {
      patchState(store, { loading: true, error: null });
      try {
        setSession(await firstValueFrom(http.post<AuthResponse>(url, body)));
        await router.navigateByUrl(redirectTo);
      } catch (err) {
        patchState(store, { loading: false, error: errorMessage(err) });
      }
    }

    return {
      login: (email: string, password: string, redirectTo = '/') =>
        authenticate('/api/auth/login', { email, password }, redirectTo),
      register: (displayName: string, email: string, password: string) =>
        authenticate('/api/auth/register', { displayName, email, password }, '/'),
      clearError: () => patchState(store, { error: null }),
      logout() {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        patchState(store, { token: null, expiresAt: 0, user: null });
        // Don't leak one user's cached data into the next session.
        injector.get(ExpensesStore).reset();
        injector.get(CategoriesStore).reset();
        router.navigateByUrl('/login');
      },
    };
  }),
);
