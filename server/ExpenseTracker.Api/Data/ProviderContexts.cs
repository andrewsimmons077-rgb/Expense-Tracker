using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ExpenseTracker.Api.Data;

// Each database provider gets its own context type so EF Core keeps a separate set of migrations for it:
//   Migrations/Sqlite   – the desktop app
//   Migrations/Postgres – the hosted / development setup
// See README "Changing the database" for how to add a migration.

public class SqliteAppDbContext(DbContextOptions<SqliteAppDbContext> options) : AppDbContext(options);

public class PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : AppDbContext(options);

/// <summary>Used by `dotnet ef` only; no database is opened to create a migration.</summary>
public class SqliteDesignTimeFactory : IDesignTimeDbContextFactory<SqliteAppDbContext>
{
    public SqliteAppDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqliteAppDbContext>().UseSqlite("Data Source=design-time.db").Options);
}

/// <summary>Used by `dotnet ef` only; no database is opened to create a migration.</summary>
public class PostgresDesignTimeFactory : IDesignTimeDbContextFactory<PostgresAppDbContext>
{
    public PostgresAppDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<PostgresAppDbContext>().UseNpgsql("Host=localhost;Database=design_time").Options);
}
