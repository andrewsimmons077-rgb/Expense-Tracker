using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Dtos;
using ExpenseTracker.Api.Models;
using ExpenseTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Controllers;

/// <summary>The user's current balance, plus a summary of their income for the dashboard.</summary>
[ApiController]
[Authorize]
[Route("api/finances")]
public class FinancesController(AppDbContext db, IncomeService income, BalanceLedger ledger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<FinancesDto>> Get()
    {
        var user = await income.ProcessDueAsync(User.GetUserId());
        return user is null ? Unauthorized() : await BuildDto(user.Id);
    }

    /// <summary>Sets the balance by hand (e.g. after checking the bank).</summary>
    [HttpPut("balance")]
    public async Task<ActionResult<FinancesDto>> SetBalance(BalanceRequest req)
    {
        // Credit anything already due first, so it isn't added again on top of the new figure.
        var userId = User.GetUserId();
        if (await income.ProcessDueAsync(userId) is null) return Unauthorized();

        await using var tx = await db.Database.BeginTransactionAsync();
        var user = await ledger.LockUserAsync(userId);
        var balance = req.Balance is { } b ? Math.Round(b, 2) : (decimal?)null;
        if (balance != user.Balance)
        {
            if (balance is { } value)
                ledger.Record(user, value - (user.Balance ?? 0), BalanceEntryKind.Manual, $"Balance set by hand to {BalanceLedger.Money(value)}");
            else
                user.Balance = null;
            user.BalanceUpdatedAt = balance is null ? null : DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return await BuildDto(userId);
    }

    /// <summary>Every change to the balance, newest first, with a note saying where it came from.</summary>
    [HttpGet("activity")]
    public async Task<IReadOnlyList<BalanceEntryDto>> Activity([FromQuery] int limit = 100)
    {
        var userId = User.GetUserId();
        await income.ProcessDueAsync(userId);
        return await db.BalanceEntries.AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .Select(x => new BalanceEntryDto(x.Id, x.Amount, x.BalanceAfter, x.Kind, x.Description, x.CreatedAt))
            .ToListAsync();
    }

    private async Task<FinancesDto> BuildDto(Guid userId)
    {
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId);
        var sources = await db.IncomeSources.AsNoTracking().Where(s => s.UserId == userId).ToListAsync();
        var nextOneTime = await db.IncomePayments.AsNoTracking()
            .Where(p => p.UserId == userId && !p.Received)
            .OrderBy(p => p.Date)
            .FirstOrDefaultAsync();

        var candidates = sources.Select(s => new NextPay(s.Title, s.Amount, s.NextPayDate)).ToList();
        if (nextOneTime is not null) candidates.Add(new NextPay(nextOneTime.Title, nextOneTime.Amount, nextOneTime.Date));

        var lastChange = await db.BalanceEntries.AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new BalanceEntryDto(x.Id, x.Amount, x.BalanceAfter, x.Kind, x.Description, x.CreatedAt))
            .FirstOrDefaultAsync();

        return new FinancesDto(
            user.Balance,
            user.BalanceUpdatedAt,
            sources.Sum(s => IncomeService.MonthlyAmount(s.Amount, s.Frequency)),
            candidates.OrderBy(c => c.Date).FirstOrDefault(),
            lastChange);
    }
}
