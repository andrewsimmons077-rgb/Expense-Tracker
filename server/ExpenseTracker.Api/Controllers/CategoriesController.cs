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
[Route("api/categories")]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<CategoryDto>> List()
    {
        var userId = User.GetUserId();
        return await db.Categories
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name, c.Color, c.Expenses.Count))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<CategoryDto>> Create(CategoryRequest req)
    {
        var userId = User.GetUserId();
        var name = req.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.UserId == userId && c.Name == name))
            return Conflict(new ProblemDetails { Title = "A category with this name already exists." });

        var category = new Category { UserId = userId, Name = name, Color = req.Color };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return Ok(new CategoryDto(category.Id, category.Name, category.Color, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CategoryDto>> Update(Guid id, CategoryRequest req)
    {
        var userId = User.GetUserId();
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (category is null) return NotFound();

        var name = req.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.UserId == userId && c.Name == name && c.Id != id))
            return Conflict(new ProblemDetails { Title = "A category with this name already exists." });

        category.Name = name;
        category.Color = req.Color;
        await db.SaveChangesAsync();
        var count = await db.Expenses.CountAsync(e => e.CategoryId == id);
        return Ok(new CategoryDto(category.Id, category.Name, category.Color, count));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var deleted = await db.Categories.Where(c => c.Id == id && c.UserId == userId).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }
}
