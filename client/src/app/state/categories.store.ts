import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Category } from '../core/models';
import { errorMessage } from '../core/utils';

interface CategoriesState {
  items: Category[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export const CategoriesStore = signalStore(
  { providedIn: 'root' },
  withState<CategoriesState>({ items: [], loaded: false, loading: false, error: null }),
  withComputed((store) => ({
    byId: computed(() => new Map(store.items().map((c) => [c.id, c]))),
  })),
  withMethods((store, http = inject(HttpClient)) => {
    const url = '/api/categories';
    const sort = (items: Category[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));

    async function load(force = false) {
      if (store.loaded() && !force) return;
      patchState(store, { loading: true, error: null });
      try {
        const items = await firstValueFrom(http.get<Category[]>(url));
        patchState(store, { items, loaded: true, loading: false });
      } catch (err) {
        patchState(store, { loading: false, error: errorMessage(err) });
      }
    }

    return {
      load,
      /** Returns an error message, or null on success. */
      async save(input: { name: string; color: string }, id?: string): Promise<string | null> {
        try {
          const saved = await firstValueFrom(
            id ? http.put<Category>(`${url}/${id}`, input) : http.post<Category>(url, input),
          );
          patchState(store, {
            items: sort(id ? store.items().map((c) => (c.id === id ? saved : c)) : [...store.items(), saved]),
          });
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      },
      async remove(id: string): Promise<string | null> {
        try {
          await firstValueFrom(http.delete(`${url}/${id}`));
          patchState(store, { items: store.items().filter((c) => c.id !== id) });
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      },
      /** Called after expenses change so counts stay accurate. */
      refresh: () => load(true),
      reset: () => patchState(store, { items: [], loaded: false }),
    };
  }),
);
