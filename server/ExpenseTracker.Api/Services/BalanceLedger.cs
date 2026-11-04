using System.Globalization;
using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Services;

/// <summary>
/// Every change to a user's balance goes through here, so each one is logged with a note saying where it came from.
/// Callers must be inside a transaction and hold the user row lock (see <see cref="LockUserAsync"/>).
/// </summary>
public class BalanceLedger(AppDbContext db)
{
    private static readonly CultureInfo Usd = CultureInfo.GetCultureInfo("en-US");

    public static string Money(decimal amount) => amount.ToString("C", Usd);

    /// <summary>Loads the user and locks the row until the transaction ends, so concurrent requests can't race.</summary>
    public async Task<User> LockUserAsync(Guid userId) =>
        await FindAndLockUserAsync(userId) ?? throw new UnauthorizedAccessException();

    public Task<User?> FindAndLockUserAsync(Guid userId) =>
        db.Database.IsNpgsql()
            ? db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE \"Id\" = {userId} FOR UPDATE").FirstOrDefaultAsync()
            // SQLite transactions start with BEGIN IMMEDIATE, which already locks the whole database for writing.
            : db.Users.FirstOrDefaultAsync(u => u.Id == userId);

    public void Record(User user, decimal amount, BalanceEntryKind kind, string description, Guid? expenseId = null)
    {
        user.Balance = (user.Balance ?? 0) + amount;
        db.BalanceEntries.Add(new BalanceEntry
        {
            UserId = user.Id,
            Amount = amount,
            BalanceAfter = user.Balance.Value,
            Kind = kind,
            Description = description,
            ExpenseId = expenseId
        });
    }

    /// <summary>
    /// Keeps the balance in step with an expense's status. A paid expense is subtracted once; if it later stops
    /// being paid (pending, cancelled or deleted) the amount is added back, and an amount change while paid is
    /// applied as the difference. Expenses paid before a balance was set were never subtracted, so they're left alone.
    /// </summary>
    public void SyncExpense(User user, Expense e, bool deleted = false)
    {
        var shouldBeDeducted = !deleted && e.Status == ExpenseStatus.Paid;

        if (e.DeductedAmount is { } deducted)
        {
            if (!shouldBeDeducted)
            {
                var why = deleted ? "was deleted" : $"changed from Paid to {e.Status}";
                if (user.Balance is not null)
                    Record(user, deducted, BalanceEntryKind.ExpenseReturned, $"Returned: “{e.Title}” {why}", deleted ? null : e.Id);
                e.DeductedAmount = null;
            }
            else if (deducted != e.Amount)
            {
                if (user.Balance is not null)
                    Record(user, deducted - e.Amount, BalanceEntryKind.ExpenseAdjusted,
                        $"Adjusted: “{e.Title}” amount changed from {Money(deducted)} to {Money(e.Amount)}", e.Id);
                e.DeductedAmount = e.Amount;
            }
        }
        else if (shouldBeDeducted && user.Balance is not null)
        {
            Record(user, -e.Amount, BalanceEntryKind.ExpensePaid, $"Paid: “{e.Title}”", e.Id);
            e.DeductedAmount = e.Amount;
        }
    }
}
