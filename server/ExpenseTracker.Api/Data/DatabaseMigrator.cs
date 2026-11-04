using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage;

namespace ExpenseTracker.Api.Data;

/// <summary>
/// Brings the database up to date on startup: creates it on first run and applies any new migrations after an update,
/// keeping existing data.
/// </summary>
public static class DatabaseMigrator
{
    public static void Migrate(AppDbContext db, ILogger logger)
    {
        AdoptPreMigrationDatabase(db, logger);

        var pending = db.Database.GetPendingMigrations().ToList();
        if (pending.Count > 0) logger.LogInformation("Applying database migrations: {Migrations}", string.Join(", ", pending));
        db.Database.Migrate();
    }

    /// <summary>
    /// Version 1.0.0 created its tables with EnsureCreated, which leaves no migration history. Such a database already
    /// matches the first migration, so it is recorded as applied instead of being created again.
    /// </summary>
    private static void AdoptPreMigrationDatabase(AppDbContext db, ILogger logger)
    {
        var creator = db.GetService<IRelationalDatabaseCreator>();
        var history = db.GetService<IHistoryRepository>();
        if (!creator.Exists() || !creator.HasTables() || history.Exists()) return;

        // Development PostgreSQL databases may predate some columns and tables; add them so the schema matches.
        if (db.Database.IsNpgsql()) db.Database.ExecuteSqlRaw(LegacyPostgresUpgrade);

        var initial = db.Database.GetMigrations().First();
        var efVersion = typeof(DbContext).Assembly.GetName().Version!.ToString(3);
        db.Database.ExecuteSqlRaw(history.GetCreateIfNotExistsScript());
        db.Database.ExecuteSqlRaw(history.GetInsertScript(new HistoryRow(initial, efVersion)));
        logger.LogInformation("Existing database recorded as migration {Migration}.", initial);
    }

    private const string LegacyPostgresUpgrade = @"
        ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ""Recurrence"" character varying(10) NOT NULL DEFAULT 'None';
        ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ""NextOccurrenceCreated"" boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ""DeductedAmount"" numeric(12,2) NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS ""Balance"" numeric(14,2) NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS ""BalanceUpdatedAt"" timestamp with time zone NULL;
        CREATE TABLE IF NOT EXISTS income_sources (
            ""Id"" uuid PRIMARY KEY,
            ""UserId"" uuid NOT NULL REFERENCES users(""Id"") ON DELETE CASCADE,
            ""Title"" character varying(100) NOT NULL,
            ""Amount"" numeric(14,2) NOT NULL,
            ""Frequency"" character varying(10) NOT NULL,
            ""NextPayDate"" date NOT NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL);
        CREATE INDEX IF NOT EXISTS ""IX_income_sources_UserId"" ON income_sources (""UserId"");
        CREATE TABLE IF NOT EXISTS income_payments (
            ""Id"" uuid PRIMARY KEY,
            ""UserId"" uuid NOT NULL REFERENCES users(""Id"") ON DELETE CASCADE,
            ""IncomeSourceId"" uuid NULL REFERENCES income_sources(""Id"") ON DELETE SET NULL,
            ""Title"" character varying(100) NOT NULL,
            ""Amount"" numeric(14,2) NOT NULL,
            ""Date"" date NOT NULL,
            ""Received"" boolean NOT NULL,
            ""OneTime"" boolean NOT NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL);
        CREATE INDEX IF NOT EXISTS ""IX_income_payments_UserId_Date"" ON income_payments (""UserId"", ""Date"");
        CREATE INDEX IF NOT EXISTS ""IX_income_payments_IncomeSourceId"" ON income_payments (""IncomeSourceId"");
        CREATE TABLE IF NOT EXISTS balance_entries (
            ""Id"" uuid PRIMARY KEY,
            ""UserId"" uuid NOT NULL REFERENCES users(""Id"") ON DELETE CASCADE,
            ""Amount"" numeric(14,2) NOT NULL,
            ""BalanceAfter"" numeric(14,2) NOT NULL,
            ""Kind"" character varying(20) NOT NULL,
            ""Description"" character varying(300) NOT NULL,
            ""ExpenseId"" uuid NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL);
        CREATE INDEX IF NOT EXISTS ""IX_balance_entries_UserId_CreatedAt"" ON balance_entries (""UserId"", ""CreatedAt"");";
}
