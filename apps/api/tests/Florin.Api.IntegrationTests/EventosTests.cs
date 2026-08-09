using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Florin.Domain.Identity;
using Florin.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Florin.Api.IntegrationTests;

/// <summary>
/// Las fiestas: quién puede programarlas, qué ve el que juega y que el regalo
/// se entrega UNA vez.
/// </summary>
[Collection("api")]
public class EventosTests(ApiDePrueba api)
{
    private static int _n;
    private static string Unico(string s) => $"{s}{Interlocked.Increment(ref _n)}";

    private record Sesion(string AccessToken, string RefreshToken);

    /* Igual que el admin: una sola cuenta de jugador para toda la clase. Cada
       registro es una llamada a auth, y auth va con rate limit por IP. */
    private static Lazy<Task<(HttpClient http, string email)>>? _jugador;
    private Task<(HttpClient http, string email)> JugadorAsync() =>
        (_jugador ??= new Lazy<Task<(HttpClient, string)>>(NuevoJugadorAsync)).Value;

    private async Task<(HttpClient http, string email)> NuevoJugadorAsync()
    {
        var http = api.CreateClient();
        var apodo = Unico("Fiestero");
        var email = $"{apodo.ToLowerInvariant()}@florin.test";
        var r = await http.PostAsJsonAsync("/api/v1/auth/registro",
            new { email, password = "Florin2026!", apodo });
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var s = (await r.Content.ReadFromJsonAsync<Sesion>())!;
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", s.AccessToken);
        return (http, email);
    }

    /* Una sola sesión de admin para toda la clase. Los endpoints de auth van
       con rate limit (20 por minuto y por IP) y en las pruebas todas las
       llamadas salen de la misma IP: una sesión por test tumbaba la suite
       entera con 429 y cuerpo vacío. */
    private static Lazy<Task<HttpClient>>? _admin;
    private Task<HttpClient> ComoAdminAsync() =>
        (_admin ??= new Lazy<Task<HttpClient>>(CrearAdminAsync)).Value;

    /// <summary>Le pone el rol de admin a una cuenta y devuelve un cliente con
    /// sesión nueva, que es lo que hace que el token traiga los permisos.</summary>
    private async Task<HttpClient> CrearAdminAsync()
    {
        var (_, email) = await NuevoJugadorAsync();
        using (var scope = api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstAsync(u => u.Email == email);
            var rol = await db.Roles.FirstAsync(r => r.Code == Roles.Admin);
            db.UserRoles.Add(new UserRole(user.Id, rol.Id));
            await db.SaveChangesAsync();
        }
        var http = api.CreateClient();
        var r = await http.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Florin2026!" });
        r.StatusCode.Should().Be(HttpStatusCode.OK, "sin login no hay admin que valga");
        var s = (await r.Content.ReadFromJsonAsync<Sesion>())!;
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", s.AccessToken);
        return http;
    }

    /// <summary>Cancela lo que haya programado: las pruebas comparten la misma
    /// base y "la fiesta viva" es una sola para todos.</summary>
    private static async Task LimpiarAsync(HttpClient admin)
    {
        var todas = await admin.GetFromJsonAsync<List<Dictionary<string, System.Text.Json.JsonElement>>>("/api/v1/eventos");
        foreach (var e in todas ?? [])
            if (!e["cancelado"].GetBoolean())
                await admin.DeleteAsync($"/api/v1/eventos/{e["id"].GetString()}");
    }

    private static object UnaFiesta(int desdeAhoraSegundos, int dura = 600, bool conRegalo = true) => new
    {
        nombre = "Noche de Wiracochas",
        empiezaEn = DateTime.UtcNow.AddSeconds(desdeAhoraSegundos),
        duraSegundos = dura,
        florines = new[] { new { tier = 15, variante = "galaxia" }, new { tier = 14, variante = (string?)null } },
        regalo = conRegalo ? new { tier = 15, variante = "galaxia" } : null,
    };

    [Fact]
    public async Task Un_jugador_normal_no_puede_programar_fiestas()
    {
        var (http, _) = await JugadorAsync();
        var r = await http.PostAsJsonAsync("/api/v1/eventos", UnaFiesta(60));
        r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Sin_fiesta_programada_no_hay_nada_vivo()
    {
        var r = await api.CreateClient().GetFromJsonAsync<Dictionary<string, object>>("/api/v1/eventos/vivo");
        r.Should().NotBeNull();
        r!.Should().ContainKey("ahora");
    }

    [Fact]
    public async Task El_admin_programa_y_todo_el_mundo_la_ve_aunque_no_tenga_cuenta()
    {
        var admin = await ComoAdminAsync();
        await LimpiarAsync(admin);
        var creada = await admin.PostAsJsonAsync("/api/v1/eventos", UnaFiesta(-5));   // empezó hace 5 s
        creada.StatusCode.Should().Be(HttpStatusCode.OK);

        // sin sesión: el juego se puede jugar sin registrarse, la fiesta también
        var deCalle = api.CreateClient();
        var vivo = await deCalle.GetFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>("/api/v1/eventos/vivo");
        vivo!["ahora"].ValueKind.Should().NotBe(System.Text.Json.JsonValueKind.Null);
        vivo["ahora"].GetProperty("nombre").GetString().Should().Be("Noche de Wiracochas");
        vivo["ahora"].GetProperty("florines").GetArrayLength().Should().Be(2);
        vivo["segundosQueQuedan"].GetInt32().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task El_regalo_se_recoge_una_sola_vez()
    {
        var admin = await ComoAdminAsync();
        await LimpiarAsync(admin);
        var creada = await admin.PostAsJsonAsync("/api/v1/eventos", UnaFiesta(-5));
        var evento = await creada.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>();
        var id = evento!["id"].GetString();

        var (jugador, _) = await JugadorAsync();

        var primera = await jugador.PostAsync($"/api/v1/eventos/{id}/regalo", null);
        primera.StatusCode.Should().Be(HttpStatusCode.OK);
        var uno = await primera.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>();
        uno!["florin"].GetProperty("tier").GetInt32().Should().Be(15);

        var segunda = await jugador.PostAsync($"/api/v1/eventos/{id}/regalo", null);
        var dos = await segunda.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>();
        dos!["florin"].ValueKind.Should().Be(System.Text.Json.JsonValueKind.Null,
            "el regalo es uno por jugador, no uno por recarga de página");
    }

    [Fact]
    public async Task Una_fiesta_cancelada_deja_de_estar_viva()
    {
        var admin = await ComoAdminAsync();
        await LimpiarAsync(admin);
        var creada = await admin.PostAsJsonAsync("/api/v1/eventos", UnaFiesta(-5));
        var evento = await creada.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>();
        var id = evento!["id"].GetString();

        (await admin.DeleteAsync($"/api/v1/eventos/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var vivo = await api.CreateClient()
            .GetFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>("/api/v1/eventos/vivo");
        var sigue = vivo!["ahora"].ValueKind != System.Text.Json.JsonValueKind.Null
                    && vivo["ahora"].GetProperty("id").GetString() == id;
        sigue.Should().BeFalse();
    }

    [Fact]
    public async Task El_admin_manda_un_aviso_y_lo_lee_todo_el_mundo()
    {
        var admin = await ComoAdminAsync();
        var r = await admin.PostAsJsonAsync("/api/v1/eventos/anuncios",
            new { texto = "En cinco minutos empieza la fiesta 🎉", duraSegundos = 300, empiezaEn = (DateTime?)null });
        r.StatusCode.Should().Be(HttpStatusCode.OK);

        // sin sesión: el aviso viaja en la misma respuesta que la fiesta
        var vivo = await api.CreateClient()
            .GetFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>("/api/v1/eventos/vivo");
        vivo!["anuncio"].GetProperty("texto").GetString().Should().Be("En cinco minutos empieza la fiesta 🎉");
        vivo["segundosDeAnuncio"].GetInt32().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Un_jugador_normal_no_puede_mandar_avisos()
    {
        var (http, _) = await JugadorAsync();
        var r = await http.PostAsJsonAsync("/api/v1/eventos/anuncios",
            new { texto = "hola a todos", duraSegundos = 60, empiezaEn = (DateTime?)null });
        r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Un_aviso_cancelado_deja_de_leerse()
    {
        var admin = await ComoAdminAsync();
        var creado = await admin.PostAsJsonAsync("/api/v1/eventos/anuncios",
            new { texto = "esto se va a cancelar", duraSegundos = 600, empiezaEn = (DateTime?)null });
        var a = await creado.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>();
        var id = a!["id"].GetString();

        (await admin.DeleteAsync($"/api/v1/eventos/anuncios/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var vivo = await api.CreateClient()
            .GetFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>("/api/v1/eventos/vivo");
        var sigue = vivo!["anuncio"].ValueKind != System.Text.Json.JsonValueKind.Null
                    && vivo["anuncio"].GetProperty("id").GetString() == id;
        sigue.Should().BeFalse();
    }

    [Fact]
    public async Task Un_aviso_vacio_no_se_manda()
    {
        var admin = await ComoAdminAsync();
        var r = await admin.PostAsJsonAsync("/api/v1/eventos/anuncios",
            new { texto = "   ", duraSegundos = 60, empiezaEn = (DateTime?)null });
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Una_fiesta_sin_florines_no_se_programa()
    {
        var admin = await ComoAdminAsync();
        var r = await admin.PostAsJsonAsync("/api/v1/eventos", new
        {
            nombre = "Vacía", empiezaEn = DateTime.UtcNow, duraSegundos = 600,
            florines = Array.Empty<object>(), regalo = (object?)null,
        });
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
