using Florin.Domain.Common;
using Florin.Domain.Jugadores;
using FluentAssertions;

namespace Florin.Domain.Tests;

public class PerfilJugadorTests
{
    static PerfilJugador Nuevo() => new(Guid.NewGuid(), "Migue");

    [Fact]
    public void Las_marcas_solo_suben()
    {
        var p = Nuevo();
        p.RegistrarMarcas(9000, 3);
        p.RegistrarMarcas(120, 0);      // empezó de nuevo: no debe borrar lo logrado

        p.MejorDinero.Should().Be(9000);
        p.MejorHito.Should().Be(3);
    }

    [Fact]
    public void El_apodo_no_puede_quedar_vacio()
    {
        var p = Nuevo();
        var accion = () => p.Editar("   ", "playa", false);
        accion.Should().Throw<DomainException>();
        p.Apodo.Should().Be("Migue");
    }

    [Fact]
    public void Editar_recorta_el_apodo_y_guarda_las_preferencias()
    {
        var p = Nuevo();
        p.Editar("  Vecino  ", "colegio", true);

        p.Apodo.Should().Be("Vecino");
        p.EscenarioPreferido.Should().Be("colegio");
        p.Zurdo.Should().BeTrue();
    }

    [Fact]
    public void Contar_partida_incrementa()
    {
        var p = Nuevo();
        p.ContarPartida();
        p.ContarPartida();
        p.PartidasJugadas.Should().Be(2);
    }
}

public class PartidaGuardadaTests
{
    [Fact]
    public void No_acepta_un_estado_vacio()
    {
        var accion = () => new PartidaGuardada(Guid.NewGuid(), "barrio", 0, 0, 0, "  ");
        accion.Should().Throw<DomainException>();
    }

    [Fact]
    public void Actualizar_pisa_todo_el_progreso()
    {
        var g = new PartidaGuardada(Guid.NewGuid(), "barrio", 100, 0, 5, "{\"t\":5}");
        g.Actualizar("playa", 7000, 2, 300, "{\"t\":300}");

        g.Escenario.Should().Be("playa");
        g.Dinero.Should().Be(7000);
        g.Hito.Should().Be(2);
        g.Segundos.Should().Be(300);
        g.Estado.Should().Be("{\"t\":300}");
    }
}

public class AlbumEntradaTests
{
    [Fact]
    public void Sin_variante_queda_como_base()
    {
        new AlbumEntrada(Guid.NewGuid(), 4, null).Variante.Should().Be("base");
        new AlbumEntrada(Guid.NewGuid(), 4, "  ").Variante.Should().Be("base");
        new AlbumEntrada(Guid.NewGuid(), 4, "arcoiris").Variante.Should().Be("arcoiris");
    }

    [Fact]
    public void La_rareza_no_puede_ser_negativa()
    {
        var accion = () => new AlbumEntrada(Guid.NewGuid(), -1, null);
        accion.Should().Throw<DomainException>();
    }
}
