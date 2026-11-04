import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Expense Tracker',
    loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account · Expense Tracker',
    loadComponent: () => import('./features/auth/register').then((m) => m.RegisterPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Expense Tracker',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'expenses',
        title: 'Expenses · Expense Tracker',
        loadComponent: () => import('./features/expenses/expense-list').then((m) => m.ExpenseListPage),
      },
      {
        path: 'activity',
        title: 'Balance activity · Expense Tracker',
        loadComponent: () => import('./features/income/activity').then((m) => m.ActivityPage),
      },
      {
        path: 'income',
        title: 'Income · Expense Tracker',
        loadComponent: () => import('./features/income/income').then((m) => m.IncomePage),
      },
      {
        path: 'profile',
        title: 'Profile · Expense Tracker',
        loadComponent: () => import('./features/account/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'settings',
        title: 'Settings · Expense Tracker',
        loadComponent: () => import('./features/account/settings').then((m) => m.SettingsPage),
      },
      {
        path: 'settings/categories',
        title: 'Categories · Expense Tracker',
        loadComponent: () => import('./features/categories/categories').then((m) => m.CategoriesPage),
      },
      { path: 'categories', redirectTo: 'settings/categories' },
    ],
  },
  { path: '**', redirectTo: '' },
];
