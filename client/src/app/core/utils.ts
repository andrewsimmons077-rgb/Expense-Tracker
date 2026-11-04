import { HttpErrorResponse } from '@angular/common/http';

/** Turns an API error (ProblemDetails / validation problem) into a single readable message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Is the API running?';
    const body = err.error;
    if (body?.errors && typeof body.errors === 'object') {
      const first = Object.values(body.errors as Record<string, string[]>).flat()[0];
      if (first) return first;
    }
    if (typeof body?.title === 'string') return body.title;
  }
  return fallback;
}

/** Local date as yyyy-MM-dd (avoids the UTC shift of toISOString). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from today until the given yyyy-MM-dd date (negative when in the past). */
export function daysUntil(s: string): number {
  const today = parseIsoDate(toIsoDate(new Date()));
  return Math.round((parseIsoDate(s).getTime() - today.getTime()) / 86_400_000);
}

export function dueLabel(dueDate: string): string {
  const days = daysUntil(dueDate);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
