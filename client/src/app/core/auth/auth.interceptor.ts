import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      // Expired or invalid session: drop it and send the user back to login.
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.includes('/api/auth/')) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
