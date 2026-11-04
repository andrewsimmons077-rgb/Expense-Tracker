namespace ExpenseTracker.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Money the user has: last entered by hand, plus income credited on pay dates since.</summary>
    public decimal? Balance { get; set; }
    public DateTime? BalanceUpdatedAt { get; set; }

    public List<Expense> Expenses { get; set; } = [];
    public List<Category> Categories { get; set; } = [];
    public List<IncomeSource> IncomeSources { get; set; } = [];
}

public enum BalanceEntryKind
{
    Manual = 0,
    Income = 1,
    IncomeReversed = 2,
    ExpensePaid = 3,
    ExpenseReturned = 4,
    ExpenseAdjusted = 5
}

/// <summary>One change to the balance, with a note saying where it came from.</summary>
public class BalanceEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public decimal Amount { get; set; }
    public decimal BalanceAfter { get; set; }
    public BalanceEntryKind Kind { get; set; }
    public required string Description { get; set; }
    public Guid? ExpenseId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}

public enum PayFrequency
{
    Weekly = 0,
    Biweekly = 1,
    Monthly = 2,
    Yearly = 3
}

/// <summary>Recurring income such as a paycheck. Credited to the balance on each pay date.</summary>
public class IncomeSource
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public decimal Amount { get; set; }
    public PayFrequency Frequency { get; set; } = PayFrequency.Monthly;
    public DateOnly NextPayDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}

/// <summary>
/// A single payment: either credited from a recurring source, or one-time pay the user entered.
/// Until its date arrives it is scheduled (Received = false); then it is added to the balance.
/// </summary>
public class IncomePayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? IncomeSourceId { get; set; }
    public required string Title { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public bool Received { get; set; }
    /// <summary>False for payments generated from a recurring source.</summary>
    public bool OneTime { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public IncomeSource? IncomeSource { get; set; }
}

public class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public string Color { get; set; } = "#6366f1";

    public User? User { get; set; }
    public List<Expense> Expenses { get; set; } = [];
}

public enum ExpenseStatus
{
    Pending = 0,
    Paid = 1,
    Cancelled = 2
}

public enum Recurrence
{
    None = 0,
    Monthly = 1,
    Yearly = 2
}

public class Expense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? CategoryId { get; set; }
    public required string Title { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public DateOnly? DueDate { get; set; }
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Pending;
    public string? Notes { get; set; }
    public Recurrence Recurrence { get; set; } = Recurrence.None;
    /// <summary>True once the next occurrence of a recurring expense has been created (so it is only created once).</summary>
    public bool NextOccurrenceCreated { get; set; }
    /// <summary>How much was subtracted from the balance when this was paid (null if nothing was).</summary>
    public decimal? DeductedAmount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public Category? Category { get; set; }
}
