using System.Text;
using System.Text.Json.Serialization;
using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Models;
using ExpenseTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// PostgreSQL for the hosted / dev setup; SQLite (a single file) for the desktop app.
var useSqlite = string.Equals(builder.Configuration["Database:Provider"], "Sqlite", StringComparison.OrdinalIgnoreCase);
// Controllers depend on AppDbContext; each provider has its own subclass with its own migrations.
if (useSqlite)
    builder.Services.AddDbContext<AppDbContext, SqliteAppDbContext>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Sqlite")));
else
    builder.Services.AddDbContext<AppDbContext, PostgresAppDbContext>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.Configure<JwtOptions>(jwtSection);
var jwt = jwtSection.Get<JwtOptions>()!;
if (Encoding.UTF8.GetByteCount(jwt.Key) < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 bytes.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<IncomeService>();
builder.Services.AddScoped<BalanceLedger>();
// Set by the desktop app so the API exits along with it.
if (int.TryParse(builder.Configuration["Desktop:ParentPid"], out var parentPid))
    builder.Services.AddHostedService(sp => ActivatorUtilities.CreateInstance<ParentProcessWatcher>(sp, parentPid));
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();

var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Creates the database on first run and applies new migrations after an update (keeping existing data).
using (var scope = app.Services.CreateScope())
{
    DatabaseMigrator.Migrate(
        scope.ServiceProvider.GetRequiredService<AppDbContext>(),
        scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database"));
}

app.UseExceptionHandler();
// In the desktop build the Angular app is published into wwwroot and served from the same origin as the API.
var serveClient = app.Environment.WebRootPath is { } webRoot && File.Exists(Path.Combine(webRoot, "index.html"));
if (serveClient)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
if (serveClient) app.MapFallbackToFile("index.html");

app.Run();
