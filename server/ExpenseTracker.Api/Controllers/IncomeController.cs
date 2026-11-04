using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Dtos;
using ExpenseTracker.Api.Models;
using ExpenseTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Controllers;

/// <summary>Income sources (recurring pay), one-time pay, and the history of what has been received.</summary>
[ApiController]
[Authorize]
[Route("api/income")]
public class IncomeController(AppDbContext db, IncomeService income, BalanceLedger ledger) : ControllerBase
{
    private const int HistoryLimit = 50;

    [HttpGet]
    public async Task<ActionResult<IncomeOverview>> Get()
    {
        var userId = User.GetUserId();
        if (await income.ProcessDueAsync(userId) is null) return Unauthorized();

        var sources = await db.IncomeSources.AsNoTracking()
            .Where(s => s.UserId == userId)
            .OrderBy(s => s.NextPayDate).ThenBy(s => s.Title)
            .ToListAsync();
        var payments = db.IncomePayments.AsNoTracking().Where(p => p.UserId == userId);
        var scheduled = await payments.Where(p => !p.Received).OrderBy(p => p.Date).Select(PaymentDto).ToListAsync();
        var received = await payments.Where(p => p.Received)
            .OrderByDescending(p => p.Date).ThenByDescending(p => p.CreatedAt)
            .Take(HistoryLimit)
            .Select(PaymentDto)
            .ToListAsync();

        return new IncomeOverview(sources.Select(ToDto).ToList(), scheduled, received);
    }

    // ---- Recurring sources ----

    [HttpPost("sources")]
    public async Task<ActionResult<IncomeSourceDto>> CreateSource(IncomeSourceRequest req)
    {
        if (req.NextPayDate < IncomeService.Today)
            return BadRequest(new ProblemDetails { Title = "Next pay date can't be in the past." });

        var source = new IncomeSource { UserId = User.GetUserId(), Title = req.Title.Trim() };
        Apply(source, req);
        db.IncomeSources.Add(source);
        await db.SaveChangesAsync();
        // A pay date of today is credited straight away.
        await income.ProcessDueAsync(source.UserId);
        return Ok(ToDto(await db.IncomeSources.AsNoTracking().FirstAsync(s => s.Id == source.Id)));
    }

    [HttpPut("sources/{id:guid}")]
    public async Task<ActionResult<IncomeSourceDto>> UpdateSource(Guid id, IncomeSourceRequest req)
    {
        var userId = User.GetUserId();
        var source = await db.IncomeSources.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        if (source is null) return NotFound();
        if (req.NextPayDate < IncomeService.Today)
            return BadRequest(new ProblemDetails { Title = "Next pay date can't be in the past." });

        Apply(source, req);
        await db.SaveChangesAsync();
        await income.ProcessDueAsync(userId);
        return ToDto(await db.IncomeSources.AsNoTracking().FirstAsync(s => s.Id == id));
    }

    [HttpDelete("sources/{id:guid}")]
    public async Task<IActionResult> DeleteSource(Guid id)
    {
        var userId = User.GetUserId();
        var deleted = await db.IncomeSources.Where(s => s.Id == id && s.UserId == userId).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---- One-time pay ----

    /// <summary>Adds one-time pay. Dated today or earlier, it is added to the balance immediately.</summary>
    [HttpPost("payments")]
    public async Task<ActionResult<IncomePaymentDto>> CreateOneTime(OneTimePayRequest req)
    {
        var userId = User.GetUserId();
        if (req.IncomeSourceId is { } sourceId && !await db.IncomeSources.AnyAsync(s => s.Id == sourceId && s.UserId == userId))
            return BadRequest(new ProblemDetails { Title = "Unknown income source." });

        var payment = new IncomePayment
        {
            UserId = userId,
            IncomeSourceId = req.IncomeSourceId,
            Title = req.Title.Trim(),
            Amount = Math.Round(req.Amount, 2),
            Date = req.Date,
            OneTime = true
        };
        db.IncomePayments.Add(payment);
        await db.SaveChangesAsync();
        await income.ProcessDueAsync(userId);
        return Ok(PaymentDto.Compile()(await db.IncomePayments.AsNoTracking().FirstAsync(p => p.Id == payment.Id)));
    }

    /// <summary>
    /// Removes a payment. If it was already added to the balance, it is taken back out, so a mistaken
    /// entry can be undone.
    /// </summary>
    [HttpDelete("payments/{id:guid}")]
    public async Task<IActionResult> DeletePayment(Guid id)
    {
        var userId = User.GetUserId();
        await using var tx = await db.Database.BeginTransactionAsync();
        var payment = await db.IncomePayments.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (payment is null) return NotFound();

        if (payment.Received)
        {
            var user = await ledger.LockUserAsync(userId);
            ledger.Record(user, -payment.Amount, BalanceEntryKind.IncomeReversed,
                $"Removed income: “{payment.Title}” ({payment.Date:MMM d, yyyy})");
        }
        db.IncomePayments.Remove(payment);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return NoContent();
    }

    private static void Apply(IncomeSource s, IncomeSourceRequest req)
    {
        s.Title = req.Title.Trim();
        s.Amount = Math.Round(req.Amount, 2);
        s.Frequency = req.Frequency;
        s.NextPayDate = req.NextPayDate;
    }

    private static IncomeSourceDto ToDto(IncomeSource s) =>
        new(s.Id, s.Title, s.Amount, s.Frequency, s.NextPayDate, IncomeService.MonthlyAmount(s.Amount, s.Frequency));

    private static readonly System.Linq.Expressions.Expression<Func<IncomePayment, IncomePaymentDto>> PaymentDto =
        p => new IncomePaymentDto(p.Id, p.Title, p.Amount, p.Date, p.Received, p.OneTime, p.IncomeSourceId);
}
