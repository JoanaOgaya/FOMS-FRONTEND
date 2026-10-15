using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using FOMS.Application.Interfaces;
using FOMS.Infrastructure.Persistence;
using FOMS.Infrastructure.Repositories;

namespace FOMS.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("FomsSqlServer");
        if (string.IsNullOrWhiteSpace(connectionString))
            connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
            connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__FomsSqlServer");
        if (string.IsNullOrWhiteSpace(connectionString))
            connectionString = Environment.GetEnvironmentVariable("MSSQL_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
            connectionString = "Server=localhost\\SQLEXPRESS;Database=FOMS_DB;Trusted_Connection=True;TrustServerCertificate=True;";

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            if (!string.IsNullOrEmpty(connectionString) && (connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase) || connectionString.Contains("Port=5432", StringComparison.OrdinalIgnoreCase)))
            {
                options.UseNpgsql(connectionString, builder =>
                {
                    builder.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName);
                    builder.CommandTimeout(120);
                    builder.EnableRetryOnFailure(5, TimeSpan.FromSeconds(10), null);
                });
            }
            else
            {
                options.UseSqlServer(connectionString, builder =>
                {
                    builder.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName);
                    builder.CommandTimeout(120);
                    builder.EnableRetryOnFailure(5, TimeSpan.FromSeconds(10), null);
                });
            }
            options.ConfigureWarnings(warnings => warnings.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
        services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));

        return services;
    }
}
