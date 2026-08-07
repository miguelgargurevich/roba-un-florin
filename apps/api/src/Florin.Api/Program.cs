using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Florin.Api.Middleware;
using Florin.Api.Security;
using Florin.Application;
using Florin.Application.Common.Interfaces;
using Florin.Domain.Identity;
using Florin.Infrastructure;
using Florin.Infrastructure.Persistence;
using Florin.Infrastructure.Security;
using Florin.Infrastructure.Seeding;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
const string CorsPolicy = "juego";

// Los mensajes de validación se los lee un jugador, así que van en español
// siempre. Sin esto dependen del locale de la máquina: en la Mac salían en
// español y dentro del contenedor en inglés.
// El try no es adorno: si la imagen corre en globalization-invariant, pedir la
// cultura "es" tira CultureNotFoundException y se cae la API entera. Que un
// detalle de idioma tumbe el servicio no tiene ningún sentido.
try { ValidatorOptions.Global.LanguageManager.Culture = new CultureInfo("es"); }
catch (CultureNotFoundException){ /* se queda en inglés; el resto funciona */ }

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

// Detrás de Traefik el RemoteIpAddress es el del proxy: sin esto todos los
// jugadores caerían en el mismo balde del rate limit.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();   // el proxy vive en la red docker, no en un rango fijo
    o.KnownProxies.Clear();
});

// Los endpoints de auth son los que se atacan a fuerza bruta, así que van con
// límite propio; el resto queda tras el token. 20/min aguanta a quien se
// equivoca de clave sin dejar sitio a un ataque por diccionario.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "desconocido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
});

var jwt = new JwtSettings();
builder.Configuration.GetSection("Jwt").Bind(jwt);   // el Secret llega por entorno o user-secrets
if (string.IsNullOrWhiteSpace(jwt.Secret) || jwt.Secret.Length < 32)
    throw new InvalidOperationException(
        "Falta Jwt:Secret o es demasiado corto (mínimo 32 caracteres). " +
        "Setealo con: dotnet user-secrets set \"Jwt:Secret\" \"$(openssl rand -base64 48)\"");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwt.Issuer, ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
        RoleClaimType = ClaimTypes.Role, ClockSkew = TimeSpan.FromSeconds(30),
    };
});

builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    foreach (var code in Permissions.All.Keys)
        options.AddPolicy(code, p => p.RequireClaim(JwtTokenGenerator.PermissionClaimType, code));
});

var app = builder.Build();

// Migrar y sembrar al arrancar: la base queda al día sin pasos manuales.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
}

app.UseForwardedHeaders();
app.UseMiddleware<ExceptionHandlingMiddleware>();     // primero: traduce excepciones a HTTP
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseCors(CorsPolicy);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/salud", () => Results.Ok(new { ok = true })).AllowAnonymous();
app.Run();

public partial class Program;   // para WebApplicationFactory en tests de integración
