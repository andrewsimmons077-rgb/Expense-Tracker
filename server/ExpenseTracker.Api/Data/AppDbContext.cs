using ExpenseTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Data;

/// <summary>The model, shared by both databases. Use <see cref="SqliteAppDbContext"/> or <see cref="PostgresAppDbContext"/>, which each have their own migrations.</summary>
public abstract class AppDbContext(DbContextOptions options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<IncomeSource> IncomeSources => Set<IncomeSource>();
    public DbSet<IncomePayment> IncomePayments => Set<IncomePayment>();
    public DbSet<BalanceEntry> BalanceEntries => Set<BalanceEntry>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite has no decimal type and can't sort or sum decimals stored as text, so money is stored as REAL there.
        if (Database.IsSqlite())
        {
            configurationBuilder.Properties<decimal>().HaveConversion<double>();
            configurationBuilder.Properties<decimal?>().HaveConversion<double?>();
        }
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256);
            e.Property(u => u.DisplayName).HasMaxLength(100);
            e.Property(u => u.Balance).HasPrecision(14, 2);
        });

        b.Entity<Category>(e =>
        {
            e.ToTable("categories");
            e.HasIndex(c => new { c.UserId, c.Name }).IsUnique();
            e.Property(c => c.Name).HasMaxLength(50);
            e.Property(c => c.Color).HasMaxLength(9);
            e.HasOne(c => c.User).WithMany(u => u.Categories).HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<BalanceEntry>(e =>
        {
            e.ToTable("balance_entries");
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
            e.Property(x => x.Amount).HasPrecision(14, 2);
            e.Property(x => x.BalanceAfter).HasPrecision(14, 2);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Description).HasMaxLength(300);
            // ExpenseId is a plain reference (no foreign key) so the note survives the expense being deleted.
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<IncomeSource>(e =>
        {
            e.ToTable("income_sources");
            e.Property(x => x.Title).HasMaxLength(100);
            e.Property(x => x.Amount).HasPrecision(14, 2);
            e.Property(x => x.Frequency).HasConversion<string>().HasMaxLength(10);
            e.HasOne(x => x.User).WithMany(u => u.IncomeSources).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<IncomePayment>(e =>
        {
            e.ToTable("income_payments");
            e.HasIndex(x => new { x.UserId, x.Date });
            e.Property(x => x.Title).HasMaxLength(100);
            e.Property(x => x.Amount).HasPrecision(14, 2);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            // Deleting a source keeps its payment history.
            e.HasOne(x => x.IncomeSource).WithMany().HasForeignKey(x => x.IncomeSourceId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Expense>(e =>
        {
            e.ToTable("expenses");
            e.HasIndex(x => new { x.UserId, x.Date });
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Amount).HasPrecision(12, 2);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Recurrence).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.DeductedAmount).HasPrecision(12, 2);
            e.HasOne(x => x.User).WithMany(u => u.Expenses).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Category).WithMany(c => c.Expenses).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
