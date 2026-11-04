using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Services;

/// <summary>
/// Credits income to the balance once its pay date has arrived. Runs whenever the user's balance or
/// income is read, so the balance is caught up the next time they open the app.
/// </summary>
public class IncomeService(AppDbContext db, BalanceLedger ledger)
{
    public static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    public static DateOnly Advance(DateOnly date, PayFrequency frequency) => frequency switch
    {
        PayFrequency.Weekly => date.AddDays(7),
        PayFrequency.Biweekly => date.AddDays(14),
        PayFrequency.Yearly => date.AddYears(1),
        _ => date.AddMonths(1)
    };

    public static decimal MonthlyAmount(decimal amount, PayFrequency frequency) => Math.Round(frequency switch
    {
        PayFrequency.Weekly => amount * 52 / 12,
        PayFrequency.Biweekly => amount * 26 / 12,
        PayFrequency.Yearly => amount / 12,
        _ => amount
    }, 2);

    /// <summary>Credits every payment that is due. Returns the user, locked and up to date.</summary>
    public async Task<User?> ProcessDueAsync(Guid userId)
    {
        var today = Today;
        await using var tx = await db.Database.BeginTransactionAsync();
        // Lock the user row so two requests arriving together can't credit the same paycheck twice.
        var user = await ledger.FindAndLockUserAsync(userId);
        if (user is null) return null;

        // Recurring sources: record a payment for each pay date that has passed, then move to the next one.
        var dueSources = await db.IncomeSources.Where(s => s.UserId == userId && s.NextPayDate <= today).ToListAsync();
        foreach (var source in dueSources)
        {
            while (source.NextPayDate <= today)
            {
                db.IncomePayments.Add(new IncomePayment
                {
                    UserId = userId,
                    IncomeSourceId = source.Id,
                    Title = source.Title,
                    Amount = source.Amount,
                    Date = source.NextPayDate,
                    Received = true
                });
                ledger.Record(user, source.Amount, BalanceEntryKind.Income,
                    $"Income: “{source.Title}” paid {source.NextPayDate:MMM d, yyyy}");
                source.NextPayDate = Advance(source.NextPayDate, source.Frequency);
            }
        }

        // One-time pay whose date has arrived.
        var dueOneTime = await db.IncomePayments.Where(p => p.UserId == userId && !p.Received && p.Date <= today).ToListAsync();
        foreach (var payment in dueOneTime)
        {
            payment.Received = true;
            ledger.Record(user, payment.Amount, BalanceEntryKind.Income, $"Income: “{payment.Title}” (one-time pay)");
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return user;
    }
}
