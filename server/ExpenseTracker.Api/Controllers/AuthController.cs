using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Dtos;
using ExpenseTracker.Api.Models;
using ExpenseTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens, IPasswordHasher<User> hasher) : ControllerBase
{
    private static readonly (string Name, string Color)[] DefaultCategories =
    [
        ("Food & Dining", "#f97316"),
        ("Housing", "#6366f1"),
        ("Transport", "#0ea5e9"),
        ("Utilities", "#eab308"),
        ("Entertainment", "#ec4899"),
        ("Health", "#22c55e"),
        ("Shopping", "#a855f7"),
        ("Other", "#64748b")
    ];

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new ProblemDetails { Title = "An account with this email already exists." });

        var user = new User { Email = email, DisplayName = req.DisplayName.Trim() };
        user.PasswordHash = hasher.HashPassword(user, req.Password);
        user.Categories.AddRange(DefaultCategories.Select(c => new Category { Name = c.Name, Color = c.Color }));

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return Ok(BuildResponse(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new ProblemDetails { Title = "Invalid email or password." });

        return Ok(BuildResponse(user));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await db.Users.FindAsync(User.GetUserId());
        return user is null ? Unauthorized() : ToDto(user);
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var user = await db.Users.FindAsync(User.GetUserId());
        if (user is null) return Unauthorized();
        // 400 rather than 401: a wrong current password shouldn't look like an expired session to the client.
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword) == PasswordVerificationResult.Failed)
            return BadRequest(new ProblemDetails { Title = "Current password is incorrect." });
        if (req.CurrentPassword == req.NewPassword)
            return BadRequest(new ProblemDetails { Title = "New password must be different from the current one." });

        user.PasswordHash = hasher.HashPassword(user, req.NewPassword);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static UserDto ToDto(User user) => new(user.Id, user.Email, user.DisplayName, user.CreatedAt);

    private AuthResponse BuildResponse(User user)
    {
        var (token, expires) = tokens.Create(user);
        return new AuthResponse(token, expires, ToDto(user));
    }
}
