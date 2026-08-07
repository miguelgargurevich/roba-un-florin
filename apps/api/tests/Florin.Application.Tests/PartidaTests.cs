using Florin.Application.Album;
using Florin.Application.Common;
using Florin.Application.Partidas;
using Florin.Application.Perfiles;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace Florin.Application.Tests;

public class PartidaTests
{
    static GuardarPartidaCommand Guardado(long dinero = 1000, int hito = 1, string esc = "barrio") =>
        new(esc, dinero, hito, 42, "{\"t\":42,\"semilla\":7}");

    [Fact]
    public async Task Guardar_por_primera_vez_crea_la_partida_y_cuenta_una_jugada()
    {
        using var a = new Andamio();
        var perfil = a.ConJugador();

        await a.Mediator.Send(Guardado());

        var partida = await a.Db.Partidas.SingleAsync();
        partida.PerfilId.Should().Be(perfil.Id);
        partida.Dinero.Should().Be(1000);
        perfil.PartidasJugadas.Should().Be(1);
    }

    [Fact]
    public async Task Guardar_de_nuevo_pisa_la_misma_fila_y_no_cuenta_otra_jugada()
    {
        using var a = new Andamio();
        var perfil = a.ConJugador();

        await a.Mediator.Send(Guardado(1000, 1));
        await a.Mediator.Send(Guardado(5000, 3, "playa"));

        var partida = await a.Db.Partidas.SingleAsync();     // una sola, no dos
        partida.Dinero.Should().Be(5000);
        partida.Escenario.Should().Be("playa");
        perfil.PartidasJugadas.Should().Be(1);
    }

    [Fact]
    public async Task Las_marcas_del_perfil_no_bajan_al_empezar_de_nuevo()
    {
        using var a = new Andamio();
        var perfil = a.ConJugador();

        await a.Mediator.Send(Guardado(9000, 4));
        await a.Mediator.Send(Guardado(120, 0));             // partida nueva desde cero

        perfil.MejorDinero.Should().Be(9000);
        perfil.MejorHito.Should().Be(4);
    }

    [Fact]
    public async Task Un_escenario_inventado_no_pasa_la_validacion()
    {
        using var a = new Andamio();
        a.ConJugador();

        var accion = async () => await a.Mediator.Send(Guardado(esc: "marte"));

        (await accion.Should().ThrowAsync<ValidationAppException>())
            .Which.Errors.Should().ContainKey(nameof(GuardarPartidaCommand.Escenario));
    }

    [Fact]
    public async Task Un_estado_gigante_no_pasa_la_validacion()
    {
        using var a = new Andamio();
        a.ConJugador();

        var accion = async () => await a.Mediator.Send(
            new GuardarPartidaCommand("barrio", 0, 0, 0, new string('x', 512_001)));

        await accion.Should().ThrowAsync<ValidationAppException>();
    }

    [Fact]
    public async Task Cada_jugador_solo_ve_su_partida()
    {
        using var a = new Andamio();
        var migue = a.ConJugador("Migue");
        await a.Mediator.Send(Guardado(7000, 2));

        var vecino = a.ConJugador("Vecino");                 // ConJugador deja la sesión en el nuevo
        (await a.Mediator.Send(new GetMiPartidaQuery())).Should().BeNull();

        a.EntraComo(migue);
        (await a.Mediator.Send(new GetMiPartidaQuery()))!.Dinero.Should().Be(7000);
        vecino.PartidasJugadas.Should().Be(0);
    }

    [Fact]
    public async Task Sin_sesion_no_hay_partida()
    {
        using var a = new Andamio();
        a.Actual.UserId = null;

        var accion = async () => await a.Mediator.Send(new GetMiPartidaQuery());
        await accion.Should().ThrowAsync<UnauthorizedAppException>();
    }
}

public class AlbumTests
{
    [Fact]
    public async Task Registrar_dos_veces_el_mismo_florin_no_duplica()
    {
        using var a = new Andamio();
        a.ConJugador();

        (await a.Mediator.Send(new RegistrarEnAlbumCommand(6, "arcoiris"))).Should().BeTrue();
        (await a.Mediator.Send(new RegistrarEnAlbumCommand(6, "arcoiris"))).Should().BeFalse();

        a.Db.Album.Count().Should().Be(1);
    }

    [Fact]
    public async Task La_variante_cambia_la_lamina()
    {
        using var a = new Andamio();
        a.ConJugador();

        await a.Mediator.Send(new RegistrarEnAlbumCommand(6, null));
        await a.Mediator.Send(new RegistrarEnAlbumCommand(6, "brillante"));

        var album = await a.Mediator.Send(new GetMiAlbumQuery());
        album.Select(x => x.Variante).Should().BeEquivalentTo(["base", "brillante"]);
    }

    [Fact]
    public async Task Una_rareza_fuera_de_rango_no_pasa()
    {
        using var a = new Andamio();
        a.ConJugador();

        var accion = async () => await a.Mediator.Send(new RegistrarEnAlbumCommand(99, null));
        await accion.Should().ThrowAsync<ValidationAppException>();
    }

    [Fact]
    public async Task El_album_es_de_cada_uno()
    {
        using var a = new Andamio();
        var migue = a.ConJugador("Migue");
        await a.Mediator.Send(new RegistrarEnAlbumCommand(5, "brillante"));

        a.ConJugador("Vecino");
        (await a.Mediator.Send(new GetMiAlbumQuery())).Should().BeEmpty();

        a.EntraComo(migue);
        (await a.Mediator.Send(new GetMiAlbumQuery())).Should().HaveCount(1);
    }
}

public class PerfilTests
{
    [Fact]
    public async Task Editar_guarda_las_preferencias_del_que_llama()
    {
        using var a = new Andamio();
        a.ConJugador();

        var dto = await a.Mediator.Send(new EditarPerfilCommand("Migue", "colegio", true));

        dto.EscenarioPreferido.Should().Be("colegio");
        dto.Zurdo.Should().BeTrue();
    }

    [Fact]
    public async Task El_ranking_ordena_por_dinero_y_es_publico()
    {
        using var a = new Andamio();
        a.ConJugador("Migue");
        await a.Mediator.Send(new GuardarPartidaCommand("barrio", 3000, 1, 10, "{}"));
        a.ConJugador("Vecino");
        await a.Mediator.Send(new GuardarPartidaCommand("barrio", 9000, 4, 10, "{}"));

        a.Actual.UserId = null;                              // el ranking se ve sin sesión
        var ranking = await a.Mediator.Send(new GetRankingQuery());

        ranking.Items.Select(x => x.Apodo).Should().ContainInOrder("Vecino", "Migue");
    }
}
