using System.ComponentModel.DataAnnotations;
using ExpenseTracker.Api.Models;

namespace ExpenseTracker.Api.Dtos;

// ---- Auth ----
public record RegisterRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MinLength(8), MaxLength(100)] string Password,
    [Required, MaxLength(100)] string DisplayName);

public record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);

public record UserDto(Guid Id, string Email, string DisplayName, DateTime CreatedAt);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(100)] string NewPassword);

public record AuthResponse(string Token, DateTime ExpiresAt, UserDto User);

// ---- Balance & income ----
public record NextPay(string Title, decimal Amount, DateOnly Date);

public record BalanceEntryDto(Guid Id, decimal Amount, decimal BalanceAfter, BalanceEntryKind Kind, string Description, DateTime CreatedAt);

public record FinancesDto(
    decimal? Balance,
    DateTime? BalanceUpdatedAt,
    /// <summary>Recurring income converted to a per-month amount (0 when there are no sources).</summary>
    decimal MonthlyIncome,
    NextPay? NextPay,
    /// <summary>The most recent balance change, so the dashboard can say where it came from.</summary>
    BalanceEntryDto? LastChange);

public record BalanceRequest([Range(-999_999_999_999, 999_999_999_999)] decimal? Balance);

public record IncomeSourceDto(Guid Id, string Title, decimal Amount, PayFrequency Frequency, DateOnly NextPayDate, decimal MonthlyAmount);

public record IncomeSourceRequest(
    [Required, MaxLength(100)] string Title,
    [Range(0.01, 999_999_999_999)] decimal Amount,
    PayFrequency Frequency,
    DateOnly NextPayDate);

public record IncomePaymentDto(Guid Id, string Title, decimal Amount, DateOnly Date, bool Received, bool OneTime, Guid? IncomeSourceId);

public record OneTimePayRequest(
    [Required, MaxLength(100)] string Title,
    [Range(0.01, 999_999_999_999)] decimal Amount,
    DateOnly Date,
    Guid? IncomeSourceId);

public record IncomeOverview(
    IReadOnlyList<IncomeSourceDto> Sources,
    IReadOnlyList<IncomePaymentDto> Scheduled,
    IReadOnlyList<IncomePaymentDto> Received);

// ---- Categories ----
public record CategoryDto(Guid Id, string Name, string Color, int ExpenseCount);

public record CategoryRequest(
    [Required, MaxLength(50)] string Name,
    [Required, RegularExpression("^#[0-9a-fA-F]{6}$")] string Color);

// ---- Expenses ----
public record ExpenseDto(
    Guid Id,
    string Title,
    decimal Amount,
    DateOnly Date,
    DateOnly? DueDate,
    ExpenseStatus Status,
    bool IsOverdue,
    string? Notes,
    Guid? CategoryId,
    string? CategoryName,
    string? CategoryColor,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    Recurrence Recurrence);

public record ExpenseRequest(
    [Required, MaxLength(200)] string Title,
    [Range(0.01, 9_999_999_999)] decimal Amount,
    DateOnly Date,
    DateOnly? DueDate,
    ExpenseStatus Status,
    [MaxLength(2000)] string? Notes,
    Guid? CategoryId,
    Recurrence Recurrence = Recurrence.None);

public record ExpenseQuery(
    string? Search,
    Guid? CategoryId,
    ExpenseStatus? Status,
    bool? Overdue,
    DateOnly? From,
    DateOnly? To,
    DateOnly? DueFrom,
    DateOnly? DueTo,
    string? SortBy,
    string? SortDir,
    int Page = 1,
    int PageSize = 20);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

// ---- Stats ----
public record CategoryTotal(Guid? CategoryId, string Name, string Color, decimal Total);
/// <summary>Paid expenses by expense date, pending ones by due date.</summary>
public record DayTotal(DateOnly Date, decimal Paid, decimal Pending);
public record StatusTotal(ExpenseStatus Status, int Count, decimal Total);

/// <summary>Pending bills due in a window: how many and how much.</summary>
public record DueTotal(int Count, decimal Total);

public record StatsSummary(
    decimal AverageMonthly,
    DateOnly AverageFrom,
    DateOnly AverageTo,
    DueTotal PendingThisMonth,
    DueTotal DueThisWeek,
    DueTotal DueNextMonth,
    IReadOnlyList<CategoryTotal> ByCategory,
    IReadOnlyList<DayTotal> ByDay,
    IReadOnlyList<StatusTotal> ByStatus);
