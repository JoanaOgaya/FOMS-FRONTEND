using Microsoft.Extensions.DependencyInjection;
using FluentValidation;
using MediatR;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Application.Behaviors;

namespace FOMS.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);
        
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly);
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        });

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IPredictionService, PredictionService>();
        services.AddScoped<IAnalyticsService, AnalyticsService>();
        return services;
    }
}
