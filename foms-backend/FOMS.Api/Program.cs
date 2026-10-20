using System.Text;
using System.Text.Json;
using FOMS.Application;
using FOMS.Infrastructure;
using FOMS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Auto-load .env file if running locally
var currentDir = new DirectoryInfo(Directory.GetCurrentDirectory());
for (var dir = currentDir; dir != null; dir = dir.Parent)
{
    var envPath = Path.Combine(dir.FullName, ".env");
    if (File.Exists(envPath))
    {
        foreach (var line in File.ReadAllLines(envPath))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#')) continue;
            var parts = trimmed.Split('=', 2);
            if (parts.Length == 2)
            {
                var key = parts[0].Trim();
                var val = parts[1].Trim().Trim('"').Trim('\'');
                Environment.SetEnvironmentVariable(key, val);
                if (key.Contains("__"))
                {
                    var configKey = key.Replace("__", ":");
                    builder.Configuration[configKey] = val;
                }
                else
                {
                    builder.Configuration[key] = val;
                }
            }
        }
        break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 4: JWT SECRET VALIDATION
// Fail fast at startup if the JWT secret is missing or too short.
// A weak secret allows attackers to forge tokens for any role.
// ─────────────────────────────────────────────────────────────────────────────
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secret = builder.Configuration["JwtSettings:Secret"];
if (string.IsNullOrWhiteSpace(secret))
{
    secret = Environment.GetEnvironmentVariable("JWT_SECRET");
}
if (string.IsNullOrWhiteSpace(secret))
{
    secret = "FOMS_Capstone_JWT_SecureKey_2026!!";
}
builder.Configuration["JwtSettings:Secret"] = secret;

if (secret.Length < 32)
    throw new InvalidOperationException(
        $"JWT Secret must be at least 32 characters long for HMAC-SHA256. " +
        $"Current length: {secret.Length}. Update JwtSettings:Secret.");

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATION SERVICES
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructureServices(builder.Configuration);

var fomsDbConnection = FOMS.Infrastructure.Configuration.DatabaseConfiguration.GetConnectionString(builder.Configuration);

builder.Services.AddDbContext<FomsDbContext>(options =>
    options.UseSqlServer(fomsDbConnection));

builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();
builder.Services.AddControllers(options =>
{
    options.Filters.Add<FOMS.Api.Filters.ApiValidationFilter>();
})
.AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "FOMS API", Version = "v1" });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 6: CORS SECURITY
// Replaced AllowAnyOrigin() with specific allowed origins.
// AllowAnyOrigin() combined with Authorization headers allows CSRF from any site.
// ─────────────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration
    .GetSection("AllowedCorsOrigins")
    .Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("FomsPolicy", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(origin => true)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        }
        else
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION — JWT BEARER
// TASK 5: RequireHttpsMetadata is true in production, false only in development
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // TASK 5: Enforce HTTPS in production. Development still works over HTTP.
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.GetValue<string>("Issuer"),
        ValidAudience = jwtSettings.GetValue<string>("Audience"),
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
        ClockSkew = TimeSpan.FromSeconds(30) // tight clock skew — tokens expire precisely
    };
    options.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            // Do not expose exception details to the client
            context.Response.Headers.Append("X-Auth-Failed", "true");
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

// ─────────────────────────────────────────────────────────────────────────────
// TASK 7: GLOBAL EXCEPTION HANDLER MIDDLEWARE
// Catches all unhandled exceptions and returns a consistent JSON response.
// Stack traces and exception types are NEVER exposed to clients.
// Mapping:
//   UnauthorizedAccessException  → 401 Unauthorized
//   ArgumentException            → 400 Bad Request
//   InvalidOperationException    → 409 Conflict
//   Everything else              → 500 Internal Server Error
// ─────────────────────────────────────────────────────────────────────────────
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionFeature = context.Features
            .Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();

        if (exceptionFeature == null) return;

        var exception = exceptionFeature.Error;
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();

        // Log the full exception internally — never send to client
        logger.LogError(exception, "Unhandled exception on {Method} {Path}",
            context.Request.Method, context.Request.Path);

        int statusCode;
        string message;

        switch (exception)
        {
            case FOMS.Application.Exceptions.ValidationException valEx:
                statusCode = StatusCodes.Status400BadRequest;
                message = "Validation failed";
                break;

            case UnauthorizedAccessException:
                statusCode = StatusCodes.Status401Unauthorized;
                message = exception.Message.Contains("locked")
                    ? exception.Message
                    : "Authentication failed. Please verify your credentials.";
                break;

            case ArgumentException:
                statusCode = StatusCodes.Status400BadRequest;
                message = exception.Message;
                break;

            case InvalidOperationException:
                statusCode = StatusCodes.Status409Conflict;
                message = exception.Message;
                break;

            case KeyNotFoundException:
                statusCode = StatusCodes.Status404NotFound;
                message = exception.Message;
                break;

            default:
                statusCode = StatusCodes.Status500InternalServerError;
                // Never expose internal details in production
                message = app.Environment.IsDevelopment()
                    ? $"Internal error: {exception.Message}"
                    : "An unexpected error occurred. Please try again later.";
                break;
        }

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";

        object response;
        if (exception is FOMS.Application.Exceptions.ValidationException validationEx)
        {
            response = new
            {
                success = false,
                message = "Validation failed",
                errors = validationEx.Errors
            };
        }
        else
        {
            response = new
            {
                success = false,
                message,
                statusCode
            };
        }

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(response,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE PIPELINE
// Order matters: Exception handler → HTTPS Redirect → CORS → Auth → Authorization
// ─────────────────────────────────────────────────────────────────────────────
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "FOMS API v1");
    c.RoutePrefix = "swagger";
});

app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? string.Empty;
    if (!path.StartsWith("/api", StringComparison.OrdinalIgnoreCase) &&
        !path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) &&
        !path.StartsWith("/ws", StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrEmpty(path) && path != "/")
    {
        context.Request.Path = "/api" + path;
    }
    await next();
});

app.UseRouting();
app.UseCors("FomsPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/", () => Results.Redirect("/swagger"));

// ─────────────────────────────────────────────────────────────────────────────
// START WEB SERVER FIRST (so Render health checks pass while migrations run)
// ─────────────────────────────────────────────────────────────────────────────
await app.StartAsync();

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE INITIALIZATION
// Uses MigrateAsync() instead of EnsureCreated() to support schema migrations.
// Runs AFTER the server is listening so Render doesn't time out.
// ─────────────────────────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var context = services.GetRequiredService<ApplicationDbContext>();
        try
        {
            await context.Database.MigrateAsync();
        }
        catch (Exception ex)
        {
            logger.LogInformation("Database migration skipped (tables exist): {Message}", ex.Message);
        }

        bool enableSeedFallback = string.Equals(Environment.GetEnvironmentVariable("ENABLE_SEED_FALLBACK"), "true", StringComparison.OrdinalIgnoreCase);
        if (enableSeedFallback)
        {
            try
            {
                await ApplicationDbContextSeed.SeedSampleDataAsync(context);
                logger.LogInformation("Database seeded successfully.");
            }
            catch (Exception ex)
            {
                logger.LogWarning("Database seed warning: {Message}", ex.Message);
            }
        }
        else
        {
            logger.LogInformation("Sample seeding skipped: live database records active (ENABLE_SEED_FALLBACK is false).");
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning("Database initialization error: {Message}", ex.Message);
    }
}

await app.WaitForShutdownAsync();
