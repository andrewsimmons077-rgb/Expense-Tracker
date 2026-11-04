using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Dtos;
using ExpenseTracker.Api.Models;
using ExpenseTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/stats")]
public class StatsController(AppDbContext db) : ControllerBase
{
    /// <summary>Totals and chart data for the dashboard. Cancelled expenses are excluded from all money totals.</summary>
    [HttpGet("summary")]
    public async Task<StatsSummary> Summary([FromQuery] DateOnly? from, [FromQuery] DateOnly? to)
    {
        var userId = User.GetUserId();
        var today = ExpensesController.Today;
        var all = db.Expenses.AsNoTracking().Where(e => e.UserId == userId);

        var rangeTo = to ?? today;
        var rangeFrom = from ?? await all.MinAsync(e => (DateOnly?)e.Date) ?? today;
        var inRange = all.Where(e => e.Date >= rangeFrom && e.Date <= rangeTo);
        var active = inRange.Where(e => e.Status != ExpenseStatus.Cancelled);

        var byCategory = await active
            .GroupBy(e => new { e.CategoryId, Name = e.Category != null ? e.Category.Name : null, Color = e.Category != null ? e.Category.Color : null })
            .Select(g => new { g.Key.CategoryId, g.Key.Name, g.Key.Color, Total = g.Sum(e => e.Amount) })
            .OrderByDescending(x => x.Total)
            .ToListAsync();

        // Only days with spending are returned; the client buckets them into days/weeks/months.
        // Paid expenses count on their date; pending ones on their due date, since that's when the money goes out.
        var paidByDay = await inRange
            .Where(e => e.Status == ExpenseStatus.Paid)
            .GroupBy(e => e.Date)
            .Select(g => new { Date = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();
        var pendingByDay = await all
            .Where(e => e.Status == ExpenseStatus.Pending)
            .Select(e => new { Date = e.DueDate ?? e.Date, e.Amount })
            .Where(e => e.Date >= rangeFrom && e.Date <= rangeTo)
            .GroupBy(e => e.Date)
            .Select(g => new { Date = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();
        var byDay = paidByDay.Select(p => p.Date).Union(pendingByDay.Select(p => p.Date))
            .Order()
            .Select(d => new DayTotal(
                d,
                paidByDay.FirstOrDefault(p => p.Date == d)?.Total ?? 0,
                pendingByDay.FirstOrDefault(p => p.Date == d)?.Total ?? 0))
            .ToList();

        var byStatus = await inRange
            .GroupBy(e => e.Status)
            .Select(g => new StatusTotal(g.Key, g.Count(), g.Sum(e => e.Amount)))
            .ToListAsync();

        // The summary cards describe "now", so they ignore the selected chart range.
        // Average monthly spending: the six full calendar months before this one.
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var avgFrom = monthStart.AddMonths(-6);
        var avgTo = monthStart.AddDays(-1);
        var sixMonthTotal = await all
            .Where(e => e.Status != ExpenseStatus.Cancelled && e.Date >= avgFrom && e.Date <= avgTo)
            .SumAsync(e => (decimal?)e.Amount) ?? 0;

        // Weeks run Monday to Sunday, matching the weekly chart.
        var endOfWeek = today.AddDays(6 - ((int)today.DayOfWeek + 6) % 7);
        var endOfMonth = monthStart.AddMonths(1).AddDays(-1);
        var nextMonthStart = monthStart.AddMonths(1);

        return new StatsSummary(
            AverageMonthly: Math.Round(sixMonthTotal / 6, 2),
            AverageFrom: avgFrom,
            AverageTo: avgTo,
            PendingThisMonth: await DueBetween(all, today, endOfMonth),
            DueThisWeek: await DueBetween(all, today, endOfWeek),
            DueNextMonth: await DueBetween(all, nextMonthStart, nextMonthStart.AddMonths(1).AddDays(-1)),
            ByCategory: byCategory.Select(c => new CategoryTotal(c.CategoryId, c.Name ?? "Uncategorized", c.Color ?? "#94a3b8", c.Total)).ToList(),
            ByDay: byDay,
            ByStatus: byStatus);
    }

    private static async Task<DueTotal> DueBetween(IQueryable<Expense> expenses, DateOnly from, DateOnly to)
    {
        var due = expenses.Where(e => e.Status == ExpenseStatus.Pending && e.DueDate >= from && e.DueDate <= to);
        return new DueTotal(await due.CountAsync(), await due.SumAsync(e => (decimal?)e.Amount) ?? 0);
    }
}
