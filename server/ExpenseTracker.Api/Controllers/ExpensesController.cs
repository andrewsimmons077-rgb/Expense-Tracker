using System.Linq.Expressions;
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
[Route("api/expenses")]
public class ExpensesController(AppDbContext db, BalanceLedger ledger) : ControllerBase
{
    internal static DateOnly Today => DateOnly.FromDateTime(DateTime.Today);

    internal static Expression<Func<Expense, ExpenseDto>> ToDto(DateOnly today) => e => new ExpenseDto(
        e.Id, e.Title, e.Amount, e.Date, e.DueDate, e.Status,
        e.Status == ExpenseStatus.Pending && e.DueDate != null && e.DueDate < today,
        e.Notes, e.CategoryId,
        e.Category != null ? e.Category.Name : null,
        e.Category != null ? e.Category.Color : null,
        e.CreatedAt, e.UpdatedAt, e.Recurrence);

    [HttpGet]
    public async Task<PagedResult<ExpenseDto>> List([FromQuery] ExpenseQuery q)
    {
        var userId = User.GetUserId();
        var today = Today;
        var query = db.Expenses.AsNoTracking().Where(e => e.UserId == userId);

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var pattern = $"%{q.Search.Trim()}%";
            // ILIKE is PostgreSQL-only; SQLite's LIKE is already case-insensitive.
            query = db.Database.IsNpgsql()
                ? query.Where(e => EF.Functions.ILike(e.Title, pattern) || (e.Notes != null && EF.Functions.ILike(e.Notes, pattern)))
                : query.Where(e => EF.Functions.Like(e.Title, pattern) || (e.Notes != null && EF.Functions.Like(e.Notes, pattern)));
        }
        if (q.CategoryId is { } cat) query = query.Where(e => e.CategoryId == cat);
        if (q.Status is { } status) query = query.Where(e => e.Status == status);
        if (q.Overdue == true) query = query.Where(e => e.Status == ExpenseStatus.Pending && e.DueDate != null && e.DueDate < today);
        if (q.From is { } from) query = query.Where(e => e.Date >= from);
        if (q.To is { } to) query = query.Where(e => e.Date <= to);
        if (q.DueFrom is { } dueFrom) query = query.Where(e => e.DueDate >= dueFrom);
        if (q.DueTo is { } dueTo) query = query.Where(e => e.DueDate <= dueTo);

        var desc = !string.Equals(q.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        IOrderedQueryable<Expense> ordered = (q.SortBy?.ToLowerInvariant()) switch
        {
            "amount" => desc ? query.OrderByDescending(e => e.Amount) : query.OrderBy(e => e.Amount),
            "title" => desc ? query.OrderByDescending(e => e.Title) : query.OrderBy(e => e.Title),
            "duedate" => desc ? query.OrderByDescending(e => e.DueDate) : query.OrderBy(e => e.DueDate),
            "status" => desc ? query.OrderByDescending(e => e.Status) : query.OrderBy(e => e.Status),
            "category" => desc ? query.OrderByDescending(e => e.Category!.Name) : query.OrderBy(e => e.Category!.Name),
            "createdat" => desc ? query.OrderByDescending(e => e.CreatedAt) : query.OrderBy(e => e.CreatedAt),
            _ => desc ? query.OrderByDescending(e => e.Date) : query.OrderBy(e => e.Date)
        };

        var page = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);
        var total = await query.CountAsync();
        var items = await ordered
            .ThenByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(ToDto(today))
            .ToListAsync();

        return new PagedResult<ExpenseDto>(items, total, page, pageSize);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ExpenseDto>> Get(Guid id)
    {
        var dto = await FindDto(id);
        return dto is null ? NotFound() : dto;
    }

    [HttpPost]
    public async Task<ActionResult<ExpenseDto>> Create(ExpenseRequest req)
    {
        var userId = User.GetUserId();
        if (!await CategoryIsValid(req.CategoryId, userId))
            return BadRequest(new ProblemDetails { Title = "Unknown category." });

        await using var tx = await db.Database.BeginTransactionAsync();
        var user = await ledger.LockUserAsync(userId);
        var expense = new Expense { UserId = userId, Title = req.Title.Trim() };
        Apply(expense, req);
        db.Expenses.Add(expense);
        ledger.SyncExpense(user, expense);
        ScheduleNextOccurrence(expense);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return CreatedAtAction(nameof(Get), new { id = expense.Id }, await FindDto(expense.Id));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ExpenseDto>> Update(Guid id, ExpenseRequest req)
    {
        var userId = User.GetUserId();
        if (!await CategoryIsValid(req.CategoryId, userId))
            return BadRequest(new ProblemDetails { Title = "Unknown category." });

        await using var tx = await db.Database.BeginTransactionAsync();
        var user = await ledger.LockUserAsync(userId);
        var expense = await db.Expenses.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
        if (expense is null) return NotFound();

        Apply(expense, req);
        expense.UpdatedAt = DateTime.UtcNow;
        ledger.SyncExpense(user, expense);
        ScheduleNextOccurrence(expense);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return (await FindDto(id))!;
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        await using var tx = await db.Database.BeginTransactionAsync();
        var user = await ledger.LockUserAsync(userId);
        var expense = await db.Expenses.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
        if (expense is null) return NotFound();

        ledger.SyncExpense(user, expense, deleted: true);
        db.Expenses.Remove(expense);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return NoContent();
    }

    private static void Apply(Expense e, ExpenseRequest req)
    {
        e.Title = req.Title.Trim();
        e.Amount = Math.Round(req.Amount, 2);
        e.Date = req.Date;
        e.DueDate = req.DueDate;
        e.Status = req.Status;
        e.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
        e.CategoryId = req.CategoryId;
        e.Recurrence = req.Recurrence;
    }

    /// <summary>
    /// When a recurring expense is paid, queue up the next one as Pending, one period later.
    /// Runs at most once per expense, so toggling Paid -> Pending -> Paid doesn't create duplicates.
    /// </summary>
    private void ScheduleNextOccurrence(Expense e)
    {
        if (e.Recurrence == Recurrence.None || e.Status != ExpenseStatus.Paid || e.NextOccurrenceCreated) return;

        DateOnly Advance(DateOnly d) => e.Recurrence == Recurrence.Monthly ? d.AddMonths(1) : d.AddYears(1);
        db.Expenses.Add(new Expense
        {
            UserId = e.UserId,
            CategoryId = e.CategoryId,
            Title = e.Title,
            Amount = e.Amount,
            Notes = e.Notes,
            Recurrence = e.Recurrence,
            Date = Advance(e.Date),
            DueDate = e.DueDate is { } due ? Advance(due) : null,
            Status = ExpenseStatus.Pending
        });
        e.NextOccurrenceCreated = true;
    }

    private async Task<bool> CategoryIsValid(Guid? categoryId, Guid userId) =>
        categoryId is null || await db.Categories.AnyAsync(c => c.Id == categoryId && c.UserId == userId);

    private Task<ExpenseDto?> FindDto(Guid id)
    {
        var userId = User.GetUserId();
        return db.Expenses.AsNoTracking()
            .Where(e => e.Id == id && e.UserId == userId)
            .Select(ToDto(Today))
            .FirstOrDefaultAsync();
    }
}
