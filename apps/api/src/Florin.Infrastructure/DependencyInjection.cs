using Florin.Application.Common.Interfaces;
using Florin.Infrastructure.Persistence;
using Florin.Infrastructure.Security;
using Florin.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Florin.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Default.");

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(connectionString, db =>
                db.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        var jwtSettings = new JwtSettings();
        config.GetSection("Jwt").Bind(jwtSettings);
        services.AddSingleton<IJwtSettings>(jwtSettings);
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();

        services.AddScoped<DatabaseSeeder>();
        return services;
    }
}
