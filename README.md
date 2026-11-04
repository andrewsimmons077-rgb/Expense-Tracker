# Expense Tracker

Full-stack expense tracker.

| Layer    | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Frontend | Angular 22 (standalone, zoneless, signals), NgRx SignalStore, Chart.js |
| Backend  | ASP.NET Core 10 Web API, EF Core 10, JWT bearer auth                 |
| Database | PostgreSQL (Npgsql); SQLite in the desktop app; EF Core migrations   |
| Desktop  | Electron, electron-builder (NSIS installer), electron-updater (GitHub Releases) |

## Features

- **Auth** – register / login pages, JWT tokens, hashed passwords (ASP.NET Identity `PasswordHasher`), route guards, auto-logout on 401.
- **Profile menu** – click your name for Profile (name, email, member since, change password), Settings, and Log out. Change your password from the Profile page.
- **Settings** – light/dark mode toggle, default dashboard chart period (both saved per device), and an Edit button that opens the categories page.
- **Expenses** – add, edit, delete, "mark as paid"; title, amount, category, date, optional due date, status (Pending / Paid / Cancelled), notes.
- **Recurring payments** – mark an expense as repeating Monthly or Yearly. When it is marked Paid, the next payment is created automatically as Pending (one month/year later, due date shifted too).
- **Filters & sorting** – search (title + notes), category, status, date range, overdue-only, sort by date / amount / due date / title / category / status, pagination.
- **Categories** – 8 starter categories per user; create, rename, recolor, delete (expenses become uncategorized). Managed from Settings.
- **Due dates** – overdue flag + "due in N days" labels, overdue highlighting.
- **Balance & income** – enter your current balance; add income sources (title, amount, weekly / every two weeks / monthly / yearly, next pay date) and one-time pay. On each pay date the amount is added to your balance automatically (caught up the next time the app is opened). The dashboard shows your balance, what's left after this month's bills, your next pay, and monthly income vs. average spending.
- **Balance tracking** – marking an expense Paid subtracts it from your balance; changing it back to Pending/Cancelled or deleting it adds the amount back, and editing a paid expense's amount applies the difference. Every change (income, payments, returns, manual edits) is logged with a note on the Balance activity page, and the latest note shows on the dashboard. Expenses paid before a balance was set are never subtracted.
- **Summary cards** – average monthly spending (previous six full months), pending this month, due this week (through Sunday), and due next month.
- **Dashboard charts** – spending over the selected period, including future days with scheduled expenses: This month (daily), 3 months (weekly), 6 months (every two weeks), 12 months and This year (monthly). Each bar stacks paid spending (by expense date) and pending bills (yellow, by due date). Category and status pies label each slice with a leader line to its amount.
- **Upcoming & Overdue cards** – pending bills due this month (default), next month, or the rest of the year, plus a separate list of everything overdue; mark any of them paid in one click.
- **Responsive UI** – table turns into cards on mobile, bottom tab bar navigation, bottom-sheet modals, light/dark mode.

## Project layout

```
client/                     Angular app
  src/app/core/             models, utils, auth (store, interceptor, guards)
  src/app/state/            NgRx SignalStores: expenses, categories
  src/app/features/         auth, layout shell, dashboard, expenses, categories
  src/app/shared/chart.ts   Chart.js wrapper component
  proxy.conf.json           /api → http://localhost:5080 in dev
server/ExpenseTracker.Api/  ASP.NET Core API
  Controllers/              Auth, Expenses, Categories, Stats
  Data/AppDbContext.cs      EF Core model; Sqlite/Postgres subclasses in ProviderContexts.cs
  Migrations/               EF Core migrations, one folder per database
desktop/                    Electron app, installer and auto-updates (main.js, scripts/)
```

## Running locally

Prerequisites: .NET 10 SDK, Node 20+, PostgreSQL running locally.

### 1. API

Set your PostgreSQL connection string (stored outside the repo via user-secrets):

```bash
cd server/ExpenseTracker.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=expense_tracker;Username=postgres;Password=YOUR_PASSWORD"
dotnet run
```

The API listens on `http://localhost:5080`. On start it creates the `expense_tracker` database if needed and applies any new EF Core migrations (see [Changing the database](#changing-the-database)).

For anything beyond local dev, also override `Jwt:Key` (user-secrets or the `Jwt__Key` environment variable) with a random 32+ byte secret.

### 2. Frontend

```bash
cd client
npm install
npm start
```

Open http://localhost:4200, create an account, and start adding expenses.

## Desktop app (Windows)

The `desktop/` folder packages everything into a Windows installer you can share. Nobody needs PostgreSQL, .NET or Node to run it.

- Electron opens the app in its own window and starts the bundled API in the background (self-contained, so no .NET install is needed). The API also serves the Angular app, so it all runs on `http://127.0.0.1:47821` on that machine only.
- Data is stored in SQLite at `%APPDATA%\Expense Tracker\expenses.db`, one file per Windows user, along with a per-install token-signing key (`signing.key`) and the API log (`api.log`).
- Closing the window stops the API; if the app is force-closed or crashes, the API notices and exits by itself.

Build the installer (needs the .NET 10 SDK and Node):

```bash
cd desktop
npm install
npm run dist
```

This builds the Angular app, publishes the API with the app in `wwwroot`, and writes `desktop/release/Expense Tracker Setup <version>.exe`. `npm start` runs the desktop app without packaging it.

The installer isn't code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time; click **More info → Run anyway**. Signing it needs a code-signing certificate (configure `win.certificateFile` in `desktop/package.json`).

### Releasing updates

Installed copies check GitHub Releases for a newer version when they start (and every 4 hours), download it in the background, then show **Update ready – Restart now / Later**. "Later" installs it the next time the app is closed. Data in `%APPDATA%\Expense Tracker` is kept, and the database is upgraded automatically on the next start. Update activity is logged to `%APPDATA%\Expense Tracker\updater.log`.

One-time setup:

1. Create a **public** GitHub repository (a private one would need a token built into the app) and push this project to it.
2. In `desktop/package.json`, set `build.publish[0].owner` to your GitHub username (and `repo` if it isn't `expense-tracker`).
3. Create a GitHub token that can create releases in that repository: a fine-grained token with **Contents: Read and write**, or a classic token with `repo`. Keep it on your machine only.

Each release:

1. Raise `version` in `desktop/package.json` (e.g. `1.1.0` → `1.2.0`). Installed copies only update to a higher version.
2. If you changed the database model, add a migration (below).
3. Publish:

   ```powershell
   cd desktop
   $env:GH_TOKEN = "<your token>"
   npm run release
   ```

   This builds the installer and uploads it, with `latest.yml` and the `.blockmap` used for smaller downloads, as a published GitHub release `v<version>`.

Copies installed from a build made before the updater was added (1.0.0) can't update themselves; install the new version over them once. Updates aren't code-signed, so SmartScreen may warn when an update installs until the app is signed.

### Changing the database

The schema is managed with EF Core migrations. Each database has its own set, `Migrations/Sqlite` (desktop app) and `Migrations/Postgres` (development), and the API applies any pending ones on start, keeping existing data. Databases created before migrations were added (version 1.0.0) are recognised and recorded as the `Initial` migration automatically.

After changing an entity or `AppDbContext`, add a migration for both databases (from `server/ExpenseTracker.Api`; run `dotnet tool restore` once first):

```bash
dotnet ef migrations add <Name> --context SqliteAppDbContext --output-dir Migrations/Sqlite
dotnet ef migrations add <Name> --context PostgresAppDbContext --output-dir Migrations/Postgres
```

Review the generated files before releasing, especially anything that drops or renames a column. The API won't start if the model has changes that no migration covers, so a missing migration shows up straight away.

### Database provider

The API picks its database with `Database:Provider`: `Postgres` (default, used for development as above) or `Sqlite` (connection string `ConnectionStrings:Sqlite`).

## API overview

All endpoints except register/login require `Authorization: Bearer <token>`.

| Method | Route                       | Notes                                                                                   |
| ------ | --------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`        | `{ displayName, email, password }` → `{ token, expiresAt, user }`                        |
| POST   | `/api/auth/login`           | `{ email, password }`                                                                   |
| GET    | `/api/auth/me`              | current user                                                                            |
| POST   | `/api/auth/change-password` | `{ currentPassword, newPassword }`                                                      |
| GET    | `/api/finances`             | balance, monthly income, next pay (credits any pay that is due first)                   |
| PUT    | `/api/finances/balance`     | `{ balance }`                                                                           |
| GET    | `/api/finances/activity`    | balance changes, newest first, each with a note                                         |
| GET    | `/api/income`               | sources, scheduled one-time pay, received history                                       |
| POST/PUT/DELETE | `/api/income/sources[/{id}]` | `{ title, amount, frequency, nextPayDate }`                                    |
| POST/DELETE | `/api/income/payments[/{id}]` | one-time pay `{ title, amount, date, incomeSourceId? }`; deleting a received payment takes it back off the balance |
| GET    | `/api/expenses`             | `search, categoryId, status, overdue, from, to, dueFrom, dueTo, sortBy, sortDir, page, pageSize` |
| GET/PUT/DELETE | `/api/expenses/{id}` |                                                                                         |
| POST   | `/api/expenses`             | `{ title, amount, date, dueDate?, status, notes?, categoryId? }`                         |
| GET/POST | `/api/categories`         | `{ name, color }`                                                                       |
| PUT/DELETE | `/api/categories/{id}`  |                                                                                         |
| GET    | `/api/stats/summary`        | `from, to` → totals, by category / status, and daily totals for the chart                         |

An expense is **overdue** when its status is Pending and its due date is before today.
