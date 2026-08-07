using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;

namespace Florin.Api.IntegrationTests;

/// <summary>
/// Levanta la API de verdad contra un Postgres de verdad (efímero, en Docker).
/// Es la única forma de comprobar lo que solo existe fuera de los handlers: el
/// JWT, las políticas de autorización, el middleware de errores y las
/// restricciones de la base.
/// </summary>
public class ApiDePrueba : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("florin_test").WithUsername("florin").WithPassword("florin")
        .Build();

    public async Task InitializeAsync() => await _pg.StartAsync();

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _pg.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // UseSetting y no ConfigureAppConfiguration: con el hosting mínimo,
        // Program.cs lee la configuración al construir la app, y para entonces
        // los delegados de ConfigureAppConfiguration todavía no corrieron.
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", _pg.GetConnectionString());
        builder.UseSetting("Jwt:Secret", "secreto-solo-para-tests-de-al-menos-32-caracteres");
        builder.UseSetting("Jwt:Issuer", "florin");
        builder.UseSetting("Jwt:Audience", "florin");
    }
}

[CollectionDefinition("api")]
public class ColeccionApi : ICollectionFixture<ApiDePrueba>;
