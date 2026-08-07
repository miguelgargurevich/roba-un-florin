using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;

namespace Florin.Api.IntegrationTests;

[Collection("api")]
public class CuentaYProgresoTests(ApiDePrueba api)
{
    private static int _n;
    private static string Unico(string s) => $"{s}{Interlocked.Increment(ref _n)}";

    private record Sesion(string AccessToken, string RefreshToken);

    private async Task<(HttpClient http, Sesion sesion, string apodo)> NuevoJugadorAsync()
    {
        var http = api.CreateClient();
        var apodo = Unico("Jugador");
        var r = await http.PostAsJsonAsync("/api/v1/auth/registro", new
        {
            email = $"{apodo.ToLowerInvariant()}@florin.test", password = "Florin2026!", apodo,
        });
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var sesion = (await r.Content.ReadFromJsonAsync<Sesion>())!;
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.AccessToken);
        return (http, sesion, apodo);
    }

    [Fact]
    public async Task La_api_responde_sin_sesion_en_salud()
    {
        var r = await api.CreateClient().GetAsync("/salud");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Registro_login_y_me_devuelven_el_mismo_jugador()
    {
        var (http, _, apodo) = await NuevoJugadorAsync();

        var me = await http.GetFromJsonAsync<Dictionary<string, object>>("/api/v1/auth/me");

        me!["apodo"].ToString().Should().Be(apodo);
        me["permissions"].ToString().Should().Contain("partida.guardar");
    }

    [Fact]
    public async Task Sin_token_los_endpoints_de_jugador_dan_401()
    {
        var anon = api.CreateClient();

        (await anon.GetAsync("/api/v1/perfil")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anon.GetAsync("/api/v1/partida")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anon.GetAsync("/api/v1/album")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Con_un_token_falsificado_tambien_da_401()
    {
        var http = api.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWxzbyJ9.firma-inventada");

        (await http.GetAsync("/api/v1/perfil")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task El_ranking_se_ve_sin_sesion()
    {
        (await api.CreateClient().GetAsync("/api/v1/perfil/ranking")).StatusCode
            .Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Guardar_y_recuperar_la_partida()
    {
        var (http, _, _) = await NuevoJugadorAsync();

        var guardar = await http.PutAsJsonAsync("/api/v1/partida", new
        {
            escenario = "colegio", dinero = 4200L, hito = 2, segundos = 310.5,
            estado = "{\"t\":310.5,\"semilla\":7}",
        });
        guardar.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var partida = await http.GetFromJsonAsync<Dictionary<string, object>>("/api/v1/partida");
        partida!["escenario"].ToString().Should().Be("colegio");
        partida["dinero"].ToString().Should().Be("4200");
    }

    [Fact]
    public async Task La_partida_de_uno_no_se_ve_desde_la_cuenta_de_otro()
    {
        var (deMigue, _, _) = await NuevoJugadorAsync();
        await deMigue.PutAsJsonAsync("/api/v1/partida", new
        {
            escenario = "playa", dinero = 8800L, hito = 3, segundos = 60.0, estado = "{\"secreto\":1}",
        });

        var (deVecino, _, _) = await NuevoJugadorAsync();
        var suya = await deVecino.GetAsync("/api/v1/partida");

        suya.StatusCode.Should().Be(HttpStatusCode.NoContent);          // no hay, y menos la ajena
        (await suya.Content.ReadAsStringAsync()).Should().NotContain("secreto");
    }

    [Fact]
    public async Task El_album_registra_la_primera_vez_y_nada_mas()
    {
        var (http, _, _) = await NuevoJugadorAsync();

        var uno = await (await http.PostAsJsonAsync("/api/v1/album", new { tier = 6, variante = "arcoiris" }))
            .Content.ReadFromJsonAsync<Dictionary<string, bool>>();
        var dos = await (await http.PostAsJsonAsync("/api/v1/album", new { tier = 6, variante = "arcoiris" }))
            .Content.ReadFromJsonAsync<Dictionary<string, bool>>();

        uno!["nuevo"].Should().BeTrue();
        dos!["nuevo"].Should().BeFalse();
        (await http.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/v1/album"))!.Should().HaveCount(1);
    }

    [Fact]
    public async Task El_refresh_rota_y_el_viejo_deja_de_servir()
    {
        var (http, sesion, _) = await NuevoJugadorAsync();

        var r = await http.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = sesion.RefreshToken });
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var nueva = (await r.Content.ReadFromJsonAsync<Sesion>())!;
        nueva.RefreshToken.Should().NotBe(sesion.RefreshToken);

        var reusar = await http.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = sesion.RefreshToken });
        reusar.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Un_apodo_repetido_no_pasa()
    {
        var (_, _, apodo) = await NuevoJugadorAsync();
        var otro = await api.CreateClient().PostAsJsonAsync("/api/v1/auth/registro", new
        {
            email = $"{Unico("otro")}@florin.test", password = "Florin2026!", apodo,
        });

        otro.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await otro.Content.ReadAsStringAsync()).Should().Contain("apodo");
    }

    [Fact]
    public async Task Los_errores_de_validacion_vuelven_con_el_detalle()
    {
        var r = await api.CreateClient().PostAsJsonAsync("/api/v1/auth/registro", new
        {
            email = "no-es-un-correo", password = "123", apodo = "x",
        });

        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var cuerpo = await r.Content.ReadAsStringAsync();
        cuerpo.Should().Contain("Email").And.Contain("Password").And.Contain("Apodo");
    }
}
